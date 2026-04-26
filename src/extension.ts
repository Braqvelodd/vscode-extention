import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('jcl-joblib-manager.updateJoblib', async (...args: any[]) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        const document = editor.document;
        const config = vscode.workspace.getConfiguration('jclJoblibManager');
        
        // Check for supported extensions
        const supportedExtensions: string[] = config.get('supportedExtensions') || [];
        const fileExtension = document.fileName.substring(document.fileName.lastIndexOf('.')).toLowerCase();
        
        if (supportedExtensions.length > 0 && !supportedExtensions.map(ext => ext.toLowerCase()).includes(fileExtension)) {
            // If the user right-clicked a non-supported file, we just exit silently or show a message
            return; 
        }

        const rawMappings: Record<string, string> = config.get('mappings') || {};
        
        // Normalize mappings to uppercase keys
        const mappings: Record<string, string> = {};
        for (const key of Object.keys(rawMappings)) {
            mappings[key.toUpperCase()] = rawMappings[key];
        }

        // If no args provided, prompt for them
        if (args.length === 0 || (args.length === 1 && typeof args[0] === 'object')) {
            const availableKeys = Object.keys(mappings).join(', ');
            const input = await vscode.window.showInputBox({
                prompt: `Enter JOBLIB shorthands (space-separated). Available: ${availableKeys}`,
                placeHolder: "e.g. dev test"
            });
            if (!input) {
                return;
            }
            args = input.trim().split(/\s+/);
        }

        // Convert shorthand args to full DSN strings (case-insensitive)
        const joblibs: string[] = [];
        const missingShorthands: string[] = [];

        args.forEach(arg => {
            const upperArg = String(arg).toUpperCase();
            const library = mappings[upperArg];
            
            if (library) {
                joblibs.push(`DSN=${library.toUpperCase()},DISP=SHR`);
            } else {
                // If not in mapping, check if it's already a DSN statement
                if (upperArg.includes('=')) {
                    joblibs.push(upperArg);
                } else {
                    joblibs.push(`DSN=${upperArg},DISP=SHR`);
                    missingShorthands.push(upperArg);
                }
            }
        });

        if (missingShorthands.length > 0) {
            vscode.window.showWarningMessage(`Shorthands not found in settings: ${missingShorthands.join(', ')}. Using them as literal text.`);
        }
        if (joblibs.length === 0) {
            vscode.window.showWarningMessage('No JOBLIB shorthand names provided.');
            return;
        }

        const text = document.getText();
        const lines = text.split(/\r?\n/);
        
        let jobCardLineIndex = -1;
        let joblibStartLine = -1;
        let joblibEndLine = -1;

        // 1. Find the JOB card
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('//') && lines[i].includes(' JOB ')) {
                jobCardLineIndex = i;
                break;
            }
        }

        if (jobCardLineIndex === -1) {
            vscode.window.showErrorMessage('Could not find a JOB card in the current file.');
            return;
        }

        // 2. Look for existing ACTIVE JOBLIB statements or orphaned DDs after the JOB card
        for (let i = jobCardLineIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // We look for active //JOBLIB or active unnamed // DD (orphans/continuations)
            const isJoblib = trimmed.startsWith('//JOBLIB');
            const isContinuation = line.match(/^\/\/\s+DD\s/);

            if (isJoblib || isContinuation) {
                if (joblibStartLine === -1) {
                    joblibStartLine = i;
                }
                joblibEndLine = i;
            } else if (trimmed.startsWith('//') && (trimmed.includes(' EXEC ') || (trimmed.includes(' DD ') && !trimmed.includes('JOBLIB')))) {
                // Stop if we hit another named DD or EXEC
                break;
            }
        }

        // 3. Prepare the new JOBLIB statements
        const finalLines: string[] = [];
        joblibs.forEach((dsn, index) => {
            if (index === 0) {
                finalLines.push(`//JOBLIB   DD ${dsn}`);
            } else {
                finalLines.push(`//         DD ${dsn}`);
            }
        });

        // 4. Perform the edit
        editor.edit(editBuilder => {
            if (joblibStartLine !== -1) {
                // Collect ALL comments (including zombie JCL) within the identified range to preserve them
                const commentsToPreserve: string[] = [];
                for (let i = joblibStartLine; i <= joblibEndLine; i++) {
                    if (lines[i].startsWith('//*')) {
                        commentsToPreserve.push(lines[i]);
                    }
                }

                const range = new vscode.Range(
                    new vscode.Position(joblibStartLine, 0),
                    new vscode.Position(joblibEndLine + 1, 0)
                );
                
                // The replacement is the new JOBLIBs followed by all original comments
                const replacementText = [...finalLines, ...commentsToPreserve].join('\n') + '\n';
                editBuilder.replace(range, replacementText);
            } else {
                // Insert after JOB card (and potentially after immediately following comments/JES cards)
                let insertIndex = jobCardLineIndex + 1;
                // Move past comments and JES cards immediately following JOB card
                while (insertIndex < lines.length && (lines[insertIndex].startsWith('//*') || lines[insertIndex].startsWith('/*'))) {
                    insertIndex++;
                }
                
                const position = new vscode.Position(insertIndex, 0);
                editBuilder.insert(position, finalLines.join('\n') + '\n');
            }
        });
    });

    context.subscriptions.push(disposable);

    // New command: Bulk Import Mappings
    let importDisposable = vscode.commands.registerCommand('jcl-joblib-manager.importMappings', async () => {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Import Mappings',
            filters: {
                'Text/CSV files': ['txt', 'csv', 'log']
            }
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        if (!fileUri || fileUri.length === 0) return;

        const importPath = fileUri[0].fsPath;
        const content = await vscode.workspace.fs.readFile(fileUri[0]);
        const text = new TextDecoder().decode(content);
        const lines = text.split(/\r?\n/);

        const newMappings: Record<string, string> = {};
        lines.forEach((line: string) => {
            // Support comma, equals, or colon as separators
            const parts = line.split(/[=,:]/);
            if (parts.length >= 2) {
                const key = parts[0].trim().toUpperCase();
                const value = parts[1].trim().toUpperCase();
                if (key && value) {
                    newMappings[key] = value;
                }
            }
        });

        if (Object.keys(newMappings).length === 0) {
            vscode.window.showErrorMessage('No valid mappings found in the selected file. Expected format: KEY=VALUE or KEY,VALUE');
            return;
        }

        const mode = await vscode.window.showQuickPick(['Merge (Add to existing)', 'Overwrite (Replace existing)'], {
            placeHolder: 'Do you want to merge these with your current mappings or replace them entirely?'
        });

        if (!mode) return;

        const config = vscode.workspace.getConfiguration('jclJoblibManager');
        const currentMappings: Record<string, string> = config.get('mappings') || {};
        
        let finalMappings: Record<string, string>;
        if (mode.startsWith('Merge')) {
            finalMappings = { ...currentMappings, ...newMappings };
        } else {
            finalMappings = newMappings;
        }

        await config.update('mappings', finalMappings, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Successfully imported ${Object.keys(newMappings).length} mappings.`);
    });

    context.subscriptions.push(importDisposable);
}

export function deactivate() {}
