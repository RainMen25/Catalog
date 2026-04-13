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
exports.exportHistory = exports.removeHistory = exports.clearHistory = exports.writeHistory = exports.readHistory = exports.key = void 0;
const common = __importStar(require("../util/common"));
const app_1 = require("../util/app");
const key = "history";
exports.key = key;
const readHistory = () => {
    return (app_1.App.instance().getContext()?.globalState.get(key) ?? []);
};
exports.readHistory = readHistory;
const writeHistoryHelper = (content) => {
    app_1.App.instance().getContext()?.globalState.update(key, content);
};
const writeHistory = (item) => {
    let history = readHistory();
    history = history.filter(i => !(i.q === item.q && i.sl === item.sl && i.tl === item.tl));
    if (history.length >= (common.getUserConfig(common.ConfigKey.maxHistory) ?? 20))
        history.pop();
    history.unshift(item);
    writeHistoryHelper(history);
    return history;
};
exports.writeHistory = writeHistory;
const clearHistory = () => {
    writeHistoryHelper([]);
    return [];
};
exports.clearHistory = clearHistory;
const removeHistory = (item) => {
    let history = readHistory();
    history = history.filter(i => !(i.q === item.q && i.sl === item.sl && i.tl === item.tl));
    writeHistoryHelper(history);
    return history;
};
exports.removeHistory = removeHistory;
const exportHistory = () => {
    common.exportToFile(JSON.stringify(readHistory(), null, 4), "history.json");
};
exports.exportHistory = exportHistory;
//# sourceMappingURL=history.js.map