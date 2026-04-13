"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const TranslationProvider_1 = require("./TranslationProvider");
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    let disposable = vscode.commands.registerCommand('extension.vsTranslate', () => {
        let translationProvider = new TranslationProvider_1.default();
        if (!translationProvider.getDefaultTraslationLang()) {
            vscode.window.showInformationMessage("Setup default translation language");
            return true;
        }
        if (!translationProvider.getKey()) {
            vscode.window.showInformationMessage("Setup Yandex Translation key");
            return true;
        }
        let editor = vscode.window.activeTextEditor;
        if (!editor || !editor.selection) {
            vscode.window.showInformationMessage("Select Text");
            return true;
        }
        const text = editor.document.getText(editor.selection);
        if (!text) {
            vscode.window.showInformationMessage("Select Text");
            return true;
        }
        translationProvider.translate(translationProvider.getDefaultTraslationLang(), text, function (word) {
            editor.edit(builder => {
                builder.replace(editor.selection, word);
            }).then(success => {
                var postion = editor.selection.end;
                editor.selection = new vscode.Selection(postion, postion);
            });
        });
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map