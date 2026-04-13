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
exports.activate = void 0;
const vscode_1 = __importDefault(require("vscode"));
const simpleTranslate = __importStar(require("./command/simple-translate"));
const completeTranslate = __importStar(require("./command/complete-translate"));
const app_1 = require("./util/app");
const command = __importStar(require("./command/index"));
const allLanguageHoverProvider = __importStar(require("./provider/all-language-hover-provider"));
const activate = (context) => {
    app_1.App.instance().setContext(context);
    [
        {
            command: command.CommandName.translation,
            handler: completeTranslate.action
        },
        {
            command: command.CommandName.simpleTranslate,
            handler: simpleTranslate.action
        },
        {
            command: command.CommandName.completeTranslate,
            handler: completeTranslate.action
        },
    ].forEach(i => {
        vscode_1.default.commands.registerCommand(i.command, (args) => i.handler(i.command, args));
    });
    vscode_1.default.languages.registerHoverProvider(allLanguageHoverProvider.language, allLanguageHoverProvider.provider);
};
exports.activate = activate;
//# sourceMappingURL=extension.js.map