#!/bin/bash

set -o errexit

sudo apt update -y
sudo apt-get install jq -y

if [[ "$TRAVIS_BRANCH" == "master" && "$TRAVIS_PULL_REQUEST" == "false" ]]
then

	git config --local user.name "TravisCI"
	git config --local user.email "travis@travis.org"

	git checkout master
	npm run build

	export COMMIT_LOG=`git log -1`
	export TRAVIS_BUILD=`echo $COMMIT_LOG | jq -r -s -R 'split("\n") | .[] | capture("Travis build: (?<buildno>.*)") | .buildno'`

	if [ -z "$TRAVIS_BUILD" ]
	then

		git add -A
		git commit --allow-empty -m "Travis build: $TRAVIS_BUILD_NUMBER"

		export SEMVER_LABEL=`echo $COMMIT_LOG | jq -r -s -R 'split("\n") | .[] | capture("#version:(?<semver>.*)") | .semver'`
		export PRERELEASE_LABEL=`echo $COMMIT_LOG | jq -r -s -R 'split("\n") | .[] | capture("#preid:(?<semver>.*)") | .semver'`

		if [ -z "$PRERELEASE_LABEL" ]
		then
			npm version $SEMVER_LABEL -m "Release v%s"
		else
			npm version prerelease --preid=$PRERELEASE_LABEL -m "Release v%s"
		fi

		git remote add origin-remote https://${GH_TOKEN}@github.com/$GH_REPOSITORY.git > /dev/null 2>&1
		git push --quiet --set-upstream origin-remote HEAD:$TRAVIS_BRANCH
		git push --quiet --set-upstream origin-remote --tags HEAD:$TRAVIS_BRANCH
	fi

fi