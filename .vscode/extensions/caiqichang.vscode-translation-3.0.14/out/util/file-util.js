"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeFile = exports.readExtensionFile = exports.writeExtensionFile = exports.readExtensionJsonFile = void 0;
const fs_1 = __importDefault(require("fs"));
const app_1 = require("./app");
const readFile = (path) => {
    return fs_1.default.readFileSync(path);
};
const writeFile = (path, content) => {
    let folder = path.substring(0, path.lastIndexOf("/"));
    fs_1.default.mkdirSync(folder, {
        recursive: true,
        mode: 0o777,
    });
    fs_1.default.writeFileSync(path, content, {
        mode: 0o777,
    });
};
exports.writeFile = writeFile;
const readJsonFile = (path) => {
    return JSON.parse(new String(readFile(path)).toString());
};
const readExtensionFile = (subpath) => {
    return readFile(`${app_1.App.instance().getContext()?.extensionPath ?? "."}/${subpath}`);
};
exports.readExtensionFile = readExtensionFile;
const writeExtensionFile = (subpath, content) => {
    writeFile(`${app_1.App.instance().getContext()?.extensionPath ?? "."}/${subpath}`, content);
};
exports.writeExtensionFile = writeExtensionFile;
const readExtensionJsonFile = (subpath) => {
    return readJsonFile(`${app_1.App.instance().getContext()?.extensionPath ?? "."}/${subpath}`);
};
exports.readExtensionJsonFile = readExtensionJsonFile;
//# sourceMappingURL=file-util.js.map