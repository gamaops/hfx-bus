export declare const HFXBUS_ID_SIZE = 16;
export declare const withValue: (object: any, property: string, value: any) => boolean;
export declare const setErrorKind: <T extends Error>(error: T, kind: string) => T & {
    code?: string | undefined;
    errno?: string | undefined;
};
