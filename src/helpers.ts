export const HFXBUS_ID_SIZE = 16;
export const DISTRIBUTED_ROUTING = Symbol('DISTRIBUTED_ROUTING');

export const withValue = (object: any, property: string, value: any) => Reflect.defineProperty(
	object,
	property,
	{
		value,
		writable: false,
		configurable: false,
		enumerable: true,
	},
);

export const setErrorKind = <T extends Error>(error: T, kind: string): T & {
	code?: string,
	errno?: string,
} => {
	withValue(error, 'code', kind);
	withValue(error, 'errno', kind);
	return error;
};
