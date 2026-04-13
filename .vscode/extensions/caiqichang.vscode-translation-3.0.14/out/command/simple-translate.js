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
exports.action = void 0;
const api = __importStar(require("../api/index"));
const common = __importStar(require("../util/common"));
const history = __importStar(require("../component/history"));
const action = (command, args) => {
    let q = common.getEditorSelection();
    if (typeof args === "string") {
        q = Buffer.from(args, "base64").toString();
    }
    let item = {
        q,
        sl: common.getUserConfig(common.ConfigKey.sourceLanguage) ?? "",
        tl: common.getUserConfig(common.ConfigKey.targetLanguage) ?? "",
        results: [],
    };
    api.translate(item).then(result => {
        history.writeHistory(result.item);
        let msg = (item.results?.map(i => `🔹${i}`) ?? []).join("");
        let msgType = common.getUserConfig(common.ConfigKey.simpleDisplayMode);
        switch (msgType) {
            case common.MessageMode.notification: {
                common.showNotification(msg);
                break;
            }
            case common.MessageMode.statusBar: {
                common.showStatusBar(msg);
                break;
            }
        }
    }).catch(e => common.showError(e));
};
exports.action = action;
//# sourceMappingURL=simple-translate.js.map