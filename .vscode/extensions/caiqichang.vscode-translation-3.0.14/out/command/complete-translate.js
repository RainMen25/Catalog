"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.action = void 0;
const index_1 = require("../webview/translate-panel/index");
const action = (command, args) => {
    index_1.TranslationPanel.instance().showPanel(command, args);
};
exports.action = action;
//# sourceMappingURL=complete-translate.js.map