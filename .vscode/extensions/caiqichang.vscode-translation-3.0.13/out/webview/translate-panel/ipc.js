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
exports.TranslationIpc = void 0;
const history = __importStar(require("../../component/history"));
const bookmark = __importStar(require("../../component/bookmark"));
const api = __importStar(require("../../api/index"));
const common = __importStar(require("../../util/common"));
const fileUtil = __importStar(require("../../util/file-util"));
class TranslationIpc {
    constructor() {
    }
    static _instance = new TranslationIpc();
    static instance() {
        return this._instance;
    }
    panel = null;
    query = null;
    setQuery(query) {
        this.query = query;
    }
    setWebview(panel) {
        this.panel = panel;
        this.panel.webview.onDidReceiveMessage((message) => {
            switch (message.operation) {
                case Operation.GetTranslation: {
                    api.translate(message.parameter).then(result => {
                        this.sendMessage({
                            operation: Operation.GetTranslation,
                            parameter: result,
                        });
                    });
                    break;
                }
                case Operation.Init: {
                    this.sendMessage({
                        operation: Operation.SaveHistory,
                        parameter: history.readHistory(),
                    });
                    this.sendMessage({
                        operation: Operation.SaveBookmark,
                        parameter: bookmark.readBookmark(),
                    });
                    if (this.query) {
                        this.sendTranslate(this.query);
                        this.query = null;
                    }
                    break;
                }
                case Operation.GetTTS: {
                    api.tts(message.parameter).then(data => {
                        let file = "/temp/tts.mp3";
                        fileUtil.writeExtensionFile(file, data);
                        if (this.panel) {
                            this.sendMessage({
                                operation: Operation.GetTTS,
                                parameter: {
                                    url: `${common.createWebviewUri(this.panel, file)}?v=${Math.random()}`,
                                },
                            });
                        }
                    });
                    break;
                }
                case Operation.SaveHistory: {
                    this.sendMessage({
                        operation: Operation.SaveHistory,
                        parameter: history.writeHistory(message.parameter),
                    });
                    break;
                }
                case Operation.RemoveHistory: {
                    this.sendMessage({
                        operation: Operation.RemoveHistory,
                        parameter: history.removeHistory(message.parameter),
                    });
                    break;
                }
                case Operation.ClearHistory: {
                    this.sendMessage({
                        operation: Operation.ClearHistory,
                        parameter: history.clearHistory(),
                    });
                    break;
                }
                case Operation.ExportHistory: {
                    history.exportHistory();
                    break;
                }
                case Operation.SaveBookmark: {
                    this.sendMessage({
                        operation: Operation.SaveBookmark,
                        parameter: bookmark.writeBookmark(message.parameter),
                    });
                    break;
                }
                case Operation.RemoveBookmark: {
                    this.sendMessage({
                        operation: Operation.RemoveBookmark,
                        parameter: bookmark.removeBookmark(message.parameter),
                    });
                    break;
                }
                case Operation.ExportBookmark: {
                    bookmark.exportBookmark();
                    break;
                }
            }
        });
        this.sendMessage({
            operation: Operation.Init,
            parameter: {
                sl: common.getUserConfig(common.ConfigKey.sourceLanguage) ?? "",
                tl: common.getUserConfig(common.ConfigKey.targetLanguage) ?? "",
            },
        });
    }
    sendMessage(message) {
        this.panel?.webview?.postMessage(message);
    }
    sendTranslate(q) {
        this.panel?.webview?.postMessage({
            operation: Operation.DoTranslate,
            parameter: {
                q,
            },
        });
    }
}
exports.TranslationIpc = TranslationIpc;
var Operation;
(function (Operation) {
    Operation["DoTranslate"] = "DoTranslate";
    Operation["GetTranslation"] = "GetTranslation";
    Operation["GetTTS"] = "GetTTS";
    Operation["Init"] = "Init";
    Operation["SaveHistory"] = "SaveHistory";
    Operation["RemoveHistory"] = "RemoveHistory";
    Operation["ClearHistory"] = "ClearHistory";
    Operation["SaveBookmark"] = "SaveBookmark";
    Operation["RemoveBookmark"] = "RemoveBookmark";
    Operation["ExportHistory"] = "ExportHistory";
    Operation["ExportBookmark"] = "ExportBookmark";
})(Operation || (Operation = {}));
//# sourceMappingURL=ipc.js.map