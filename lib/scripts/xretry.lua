--[[
  Retry stalled out messages on streams:
  
    Input:
      KEYS[1] 'group' // The group to read messages
      KEYS[2] 'consumerId' // The consumer id that is ready to claim messages
      KEYS[3] 'retryLimit' // Maximum number of retries
      KEYS[4] 'count' // Maximum number of messages to be claimed
      KEYS[5] 'pageSize' // Pagination size when iterating over pending messages list
      KEYS[6] 'deadline' // Minimum time (ms) that a message must be in pending list to be considered stalled out

    ARGV[N] // Streams key
]]
local rcall = redis.call
local toRetry = {}
local claimed = {}
local retryLimit = tonumber(KEYS[3])
local count = tonumber(KEYS[4])
local pageSize = tonumber(KEYS[5])
local deadline = tonumber(KEYS[6])

for i = 1, #ARGV do
  local pendingSummary = rcall("XPENDING", ARGV[i], KEYS[1])
  if pendingSummary[1] > 0 then
    local pendingIndex = pendingSummary[2]
    while pendingIndex ~= "" and #toRetry < count do
      local pending = rcall("XPENDING", ARGV[i], KEYS[1], pendingIndex, "+", pageSize)
      pendingIndex = ""
      for t = 1, #pending do
        if pending[t][4] < retryLimit and pending[t][3] >= deadline then
          pending[t][#pending[t]+1] = ARGV[i]
          toRetry[#toRetry+1] = pending[t]
        end
        pendingIndex = pending[t][1]
      end
      if #pending < pageSize then
        pendingIndex = ""
      end
    end
  end
  if #toRetry >= count then
    break
  end
end

for i = 1, #toRetry do
  local claim = rcall("XCLAIM", toRetry[i][5], KEYS[1], KEYS[2], deadline, toRetry[i][1], "RETRYCOUNT", toRetry[i][4]+1)
  if #claim > 0 then
    toRetry[i][#toRetry[i]+1] = claim[1][2]
    claimed[#claimed+1] = toRetry[i]
  end
  
end

return claimed