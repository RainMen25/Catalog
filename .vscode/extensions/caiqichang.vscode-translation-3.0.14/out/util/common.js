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
exports.escapeHtml = exports.exportToFile = exports.createUri = exports.createWebviewUri = exports.createWebviewPanel = exports.showModal = exports.showStatusBar = exports.showNotification = exports.showError = exports.readPackageJson = exports.getUserConfig = exports.ConfigKey = exports.getEditorSelection = exports.MessageMode = void 0;
const vscode_1 = __importDefault(require("vscode"));
const app_1 = require("../util/app");
const fileUtil = __importStar(require("../util/file-util"));
const getEditorSelection = () => {
    return vscode_1.default.window.activeTextEditor?.document.getText(vscode_1.default.window.activeTextEditor?.selection) ?? "";
};
exports.getEditorSelection = getEditorSelection;
const showError = (content) => {
    console.error(content);
    vscode_1.default.window.showErrorMessage(content);
};
exports.showError = showError;
const showNotification = (content) => {
    vscode_1.default.window.showInformationMessage(content);
};
exports.showNotification = showNotification;
const showStatusBar = (content) => {
    vscode_1.default.window.setStatusBarMessage(content);
};
exports.showStatusBar = showStatusBar;
const showModal = (content) => {
    vscode_1.default.window.showInformationMessage("Translation", {
        modal: true,
        detail: content,
    });
};
exports.showModal = showModal;
var MessageMode;
(function (MessageMode) {
    MessageMode["notification"] = "notification";
    MessageMode["modal"] = "modal";
    MessageMode["statusBar"] = "statusBar";
})(MessageMode || (exports.MessageMode = MessageMode = {}));
var ConfigKey;
(function (ConfigKey) {
    ConfigKey["sourceLanguage"] = "source-language";
    ConfigKey["targetLanguage"] = "target-language";
    ConfigKey["simpleDisplayMode"] = "simple-display-mode";
    ConfigKey["maxHistory"] = "max-history";
    ConfigKey["translationApiProvider"] = "translation-api-provider";
    ConfigKey["voiceApiProvider"] = "voice-api-provider";
    ConfigKey["autoTranslateHovering"] = "auto-translate-hovering";
})(ConfigKey || (exports.ConfigKey = ConfigKey = {}));
const readPackageJson = () => {
    app_1.App.instance().getContext()?.extension?.packageJSON;
};
exports.readPackageJson = readPackageJson;
const configTitle = "translation";
const getUserConfig = (key) => {
    let packageConfig = readPackageJson()?.contributes?.configuration?.properties ?? {};
    let config = vscode_1.default.workspace.getConfiguration(configTitle);
    return config.get(key) ?? packageConfig?.[`${configTitle}.${key}`]?.default ?? null;
};
exports.getUserConfig = getUserConfig;
const createWebviewPanel = (id, title) => {
    return vscode_1.default.window.createWebviewPanel(id, title, vscode_1.default.window.activeTextEditor ? vscode_1.default.ViewColumn.Beside : vscode_1.default.ViewColumn.Active, {
        enableScripts: true,
        enableFindWidget: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode_1.default.Uri.file(app_1.App.instance().getContext()?.extensionPath ?? "")],
    });
};
exports.createWebviewPanel = createWebviewPanel;
const createWebviewUri = (webviewPanel, subpath) => {
    return webviewPanel.webview.asWebviewUri(createUri(subpath));
};
exports.createWebviewUri = createWebviewUri;
const createUri = (subpath) => {
    return vscode_1.default.Uri.file(`${app_1.App.instance().getContext()?.extensionPath ?? ""}${subpath}`);
};
exports.createUri = createUri;
const exportToFile = (content, fileName) => {
    vscode_1.default.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
    }).then(uri => {
        if (uri && uri.length > 0) {
            let path = `${uri[0].fsPath}/${fileName}`;
            fileUtil.writeFile(path, content);
            showNotification(`Export to file ${path}`);
        }
    });
};
exports.exportToFile = exportToFile;
const escapeHtml = (content) => {
    return content.replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
};
exports.escapeHtml = escapeHtml;
//# sourceMappingURL=common.js.map