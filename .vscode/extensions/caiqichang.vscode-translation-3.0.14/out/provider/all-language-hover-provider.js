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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.provider = exports.language = void 0;
const vscode_1 = __importDefault(require("vscode"));
const api = __importStar(require("../api/index"));
const common = __importStar(require("../util/common"));
const history = __importStar(require("../component/history"));
const language = "*";
exports.language = language;
const provider = {
    async provideHover(document, position, token) {
        let q = common.getEditorSelection();
        if (!q)
            return null;
        let text = document.getText(document.getWordRangeAtPosition(position));
        if (q.indexOf(text) < 0)
            return null;
        let base64Query = Buffer.from(q).toString("base64");
        let simpleTranslateUrl = vscode_1.default.Uri.parse(`command:simpleTranslate?["${base64Query}"]`);
        let completeTranslateUrl = vscode_1.default.Uri.parse(`command:completeTranslate?["${base64Query}"]`);
        if (common.getUserConfig(common.ConfigKey.autoTranslateHovering)) {
            let item = {
                q,
                sl: common.getUserConfig(common.ConfigKey.sourceLanguage) ?? "",
                tl: common.getUserConfig(common.ConfigKey.targetLanguage) ?? "",
                results: [],
            };
            let translate = "";
            await api.translate(item).then(result => {
                history.writeHistory(result.item);
                translate = (item.results?.map(i => `<br>🔹${i}`) ?? []).join("");
            });
            let content = new vscode_1.default.MarkdownString(`[Complete Translation](${completeTranslateUrl})${translate}`);
            content.isTrusted = true;
            content.supportHtml = true;
            return new vscode_1.default.Hover(content);
        }
        else {
            let content = new vscode_1.default.MarkdownString(`Translation: [Simple](${simpleTranslateUrl}) | [Complete](${completeTranslateUrl})`);
            content.isTrusted = true;
            return new vscode_1.default.Hover(content);
        }
    },
};
exports.provider = provider;
//# sourceMappingURL=all-language-hover-provider.js.map