"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HFXBUS_ID_SIZE = 16;
exports.withValue = (object, property, value) => Reflect.defineProperty(object, property, {
    value,
    writable: false,
    configurable: false,
    enumerable: true,
});
exports.setErrorKind = (error, kind) => {
    exports.withValue(error, 'code', kind);
    exports.withValue(error, 'errno', kind);
    return error;
};
