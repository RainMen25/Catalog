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
exports.TranslationPanel = void 0;
const common = __importStar(require("../../util/common"));
const command = __importStar(require("../../command/index"));
const fileUtil = __importStar(require("../../util/file-util"));
const ipc_1 = require("./ipc");
class TranslationPanel {
    constructor() {
    }
    static _instance = new TranslationPanel();
    static instance() {
        return this._instance;
    }
    panel = null;
    initPanel = () => {
        this.panel = common.createWebviewPanel("translationPanel", "Translation");
        this.panel.onDidDispose(() => this.panel = null);
        this.panel.webview.html = fileUtil.readExtensionFile("static/translation-panel.html").toString()
            .replaceAll("${extensionPath}", common.createWebviewUri(this.panel, "").toString())
            .replaceAll("${version}", Math.random().toString());
        this.panel.iconPath = common.createUri("/resources/logo.png");
        ipc_1.TranslationIpc.instance().setWebview(this.panel);
    };
    showPanel = (cmd, args) => {
        let q = common.getEditorSelection();
        let fromComplete = cmd === command.CommandName.completeTranslate;
        if (typeof args === "string") {
            fromComplete = true;
            q = Buffer.from(args, "base64").toString();
        }
        if (this.panel === null) {
            if (fromComplete)
                ipc_1.TranslationIpc.instance().setQuery(q);
            this.initPanel();
        }
        else if (!this.panel.visible) {
            this.panel.reveal();
            ipc_1.TranslationIpc.instance().sendTranslate(q);
        }
        else {
            ipc_1.TranslationIpc.instance().sendTranslate(q);
        }
    };
}
exports.TranslationPanel = TranslationPanel;
//# sourceMappingURL=index.js.map