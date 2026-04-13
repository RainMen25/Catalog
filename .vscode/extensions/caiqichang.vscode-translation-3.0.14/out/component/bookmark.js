"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportBookmark = exports.removeBookmark = exports.writeBookmark = exports.readBookmark = exports.key = void 0;
const app_1 = require("../util/app");
const common = __importStar(require("../util/common"));
const key = "bookmark";
exports.key = key;
const readBookmark = () => {
    return (app_1.App.instance().getContext()?.globalState.get(key) ?? []);
};
exports.readBookmark = readBookmark;
const writebookmarkHelper = (content) => {
    app_1.App.instance().getContext()?.globalState.update(key, content);
};
const writeBookmark = (item) => {
    let bookmark = readBookmark();
    bookmark = bookmark.filter(i => !(i.q === item.q && i.sl === item.sl && i.tl === item.tl));
    bookmark.unshift(item);
    writebookmarkHelper(bookmark);
    return bookmark;
};
exports.writeBookmark = writeBookmark;
const removeBookmark = (item) => {
    let bookmark = readBookmark();
    bookmark = bookmark.filter(i => !(i.q === item.q && i.sl === item.sl && i.tl === item.tl));
    writebookmarkHelper(bookmark);
    return bookmark;
};
exports.removeBookmark = removeBookmark;
const exportBookmark = () => {
    common.exportToFile(JSON.stringify(readBookmark(), null, 4), "bookmark.json");
};
exports.exportBookmark = exportBookmark;
//# sourceMappingURL=bookmark.js.map