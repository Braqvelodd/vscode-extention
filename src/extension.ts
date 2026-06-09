import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // 1. JOBLIB Update Command
    let updateJoblib = vscode.commands.registerCommand('jcl-library-manager.updateJoblib', async (...args: any[]) => {
        await updateLibrary('JOB', args);
    });

    // 2. PROCLIB Update Command
    let updateProclib = vscode.commands.registerCommand('jcl-library-manager.updateProclib', async (...args: any[]) => {
        await updateLibrary('PROC', args);
    });

    const originalGetConfiguration = vscode.workspace.getConfiguration;
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
        value: function(section: string, resource: any) {
            const config = originalGetConfiguration.call(vscode.workspace, section, resource);
            if (section === 'jclLibraryManager') {
                return {
                    get: (key: string) => {
                        if (key === 'supportedExtensions') {
                            const exts = config.get<string[]>('supportedExtensions') || [];
                            const editor = vscode.window.activeTextEditor;
                            if (editor) {
                                const fileName = editor.document.fileName.toLowerCase();
                                if (fileName.includes('(') && fileName.endsWith(')')) {
                                    const lastDot = fileName.lastIndexOf('.');
                                    const ext = lastDot !== -1 ? fileName.substring(lastDot) : fileName;
                                    if (!exts.map(e => e.toLowerCase()).includes(ext)) {
                                        return [...exts, ext];
                                    }
                                }
                            }
                            return exts;
                        }
                        return config.get(key);
                    },
                    has: (key: string) => config.has(key),
                    inspect: (key: string) => config.inspect(key),
                    update: (key: string, value: any, target: any) => config.update(key, value, target)
                } as any;
            }
            return config;
        },
        writable: true,
        configurable: true
    });

    let dummyCommand = vscode.commands.registerCommand('jcl-library-manager.dummyCommand', async () => {
    });

    // 3. Job Card Update Command
    let updateJobCard = vscode.commands.registerCommand('jcl-library-manager.updateJobCard', async () => {
        await updateJobCardLogic();
    });

    // 4. Bulk Import Command
    let importMappings = vscode.commands.registerCommand('jcl-library-manager.importMappings', async () => {
        await bulkImport();
    });

    context.subscriptions.push(updateJoblib, updateProclib, dummyCommand, updateJobCard, importMappings);
}

async function updateJobCardLogic() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
    }

    const document = editor.document;
    const config = vscode.workspace.getConfiguration('jclLibraryManager');
    
    // Check for supported extensions
    const supportedExtensions: string[] = config.get('supportedExtensions') || [];
    const fileName = document.fileName.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));
    
    if (supportedExtensions.length > 0 && !supportedExtensions.map(ext => ext.toLowerCase()).includes(fileExtension)) {
        return; 
    }
    let skeleton = config.get<string>('jobCardSkeleton') || '';

    if (!skeleton) {
        vscode.window.showErrorMessage('No Job Card skeleton defined in settings.');
        return;
    }

    // Default values from settings
    let overrides: Record<string, string> = {
        'CLASS': config.get<string>('defaultClass') || 'A',
        'MSGCLASS': config.get<string>('defaultMsgClass') || 'X',
        'NOTIFY': '',
        'TYPRUN': '',
        'REGION': ''
    };

    // Prompt for overrides
    const input = await vscode.window.showInputBox({
        prompt: "Optional overrides: C=class MC=msgclass N=Y/N T=typrun R=region",
        placeHolder: "e.g. C=B MC=Y N=Y R=4M"
    });

    if (input) {
        // Use a regex to split while allowing empty strings between multiple spaces if we want, 
        // but standard split(/\s+/) collapses them. Let's use a placeholder like '.' or '-' to skip.
        const parts = input.trim().split(/\s+/);
        parts.forEach((part, index) => {
            if (part.includes('=')) {
                // Keyed format: C=A, MC=X, etc.
                const [key, val] = part.toUpperCase().split('=');
                if (key === 'C') overrides['CLASS'] = val;
                else if (key === 'MC') overrides['MSGCLASS'] = val;
                else if (key === 'N') overrides['NOTIFY'] = val === 'Y' ? '&SYSUID' : '';
                else if (key === 'T') overrides['TYPRUN'] = val;
                else if (key === 'R') overrides['REGION'] = val;
            } else {
                // Positional format: CLASS MSGCLASS REGION NOTIFY TYPRUN
                // Allow skipping using a dot '.' or underscore '_'
                if (part === '.' || part === '_') return;
                
                const val = part.toUpperCase();
                if (index === 0) overrides['CLASS'] = val;
                else if (index === 1) overrides['MSGCLASS'] = val;
                else if (index === 2) overrides['REGION'] = val;
                else if (index === 3) overrides['NOTIFY'] = val === 'Y' ? '&SYSUID' : '';
                else if (index === 4) overrides['TYPRUN'] = val;
            }
        });
    }

    const text = document.getText();
    const lines = text.split(/\r?\n/);
    
    let jobCardStart = -1;
    let jobCardEnd = -1;
    let currentJobName = 'TEMPJOB';

    // 1. Find the Job Card range
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('//') && line.includes(' JOB ')) {
            jobCardStart = i;
            jobCardEnd = i;
            
            // Extract job name
            const match = line.match(/^\/\/([A-Z0-9#@$]{1,8})\s+JOB/);
            if (match) {
                currentJobName = match[1];
            }

            // Find continuation lines
            let j = i;
            while (j < lines.length) {
                const currentLine = lines[j];
                const content = currentLine.split('//*')[0].trim();
                if (content.endsWith(',')) {
                    j++;
                    if (j < lines.length && lines[j].startsWith('//') && !lines[j].startsWith('//*')) {
                        jobCardEnd = j;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            break;
        }
    }

    if (jobCardStart === -1) {
        jobCardStart = 0;
        // vscode.window.showErrorMessage('Could not find a JOB card.');
        // return;
    }

    // 2. Prepare the new Job Card
    const randomChars = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 2; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    // Apply substitutions
    let finalJobCard = skeleton
        .replace(/\{jobName\}/g, currentJobName)
        .replace(/\{@@\}/g, () => randomChars())
        .replace(/\{class\}/g, overrides['CLASS'])
        .replace(/\{msgclass\}/g, overrides['MSGCLASS']);

    // Handle optional fields: if empty, we might want to remove the comma/parameter entirely
    // or just let the skeleton handle it. For now, let's be smart about NOTIFY, TYPRUN, REGION.
    
    if (overrides['NOTIFY']) {
        finalJobCard = finalJobCard.replace(/\{notify\}/g, `NOTIFY=${overrides['NOTIFY']}`);
    } else {
        finalJobCard = finalJobCard.replace(/,?\s*\{notify\}/g, '');
    }

    if (overrides['TYPRUN']) {
        finalJobCard = finalJobCard.replace(/\{typrun\}/g, `TYPRUN=${overrides['TYPRUN']}`);
    } else {
        finalJobCard = finalJobCard.replace(/,?\s*\{typrun\}/g, '');
    }

    if (overrides['REGION']) {
        finalJobCard = finalJobCard.replace(/\{region\}/g, `REGION=${overrides['REGION']}`);
    } else {
        finalJobCard = finalJobCard.replace(/,?\s*\{region\}/g, '');
    }

    // 3. Replace
    await editor.edit(editBuilder => {
        const range = new vscode.Range(
            new vscode.Position(jobCardStart, 0),
            new vscode.Position(jobCardEnd + 1, 0)
        );
        editBuilder.replace(range, finalJobCard + '\n');
    });
}

async function updateLibrary(type: 'JOB' | 'PROC', args: any[]) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
    }

    const document = editor.document;
    const config = vscode.workspace.getConfiguration('jclLibraryManager');
    
    // Check for supported extensions
    const supportedExtensions: string[] = config.get('supportedExtensions') || [];
    const fileName = document.fileName.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));
    
    if (supportedExtensions.length > 0 && !supportedExtensions.map(ext => ext.toLowerCase()).includes(fileExtension)) {
        return; 
    }

    const mappingKey = type === 'JOB' ? 'joblibMappings' : 'proclibMappings';
    const rawMappings: Record<string, string> = config.get(mappingKey) || {};
    const mappings: Record<string, string> = {};
    for (const key of Object.keys(rawMappings)) {
        mappings[key.toUpperCase()] = rawMappings[key];
    }

    // Get input if no args
    if (args.length === 0 || (args.length === 1 && typeof args[0] === 'object')) {
        const availableKeys = Object.keys(mappings).join(', ');
        const input = await vscode.window.showInputBox({
            prompt: `Enter ${type}LIB shorthands (space-separated). Available: ${availableKeys}`,
            placeHolder: "e.g. dev test"
        });
        if (!input) return;
        args = input.trim().split(/\s+/);
    }

    const libraryNames: string[] = [];
    const missing: string[] = [];

    args.forEach(arg => {
        const upperArg = String(arg).toUpperCase();
        const lib = mappings[upperArg];
        if (lib) {
            libraryNames.push(lib.toUpperCase());
        } else {
            libraryNames.push(upperArg);
            if (!upperArg.includes('=') && !upperArg.includes('.')) {
                missing.push(upperArg);
            }
        }
    });

    if (missing.length > 0) {
        vscode.window.showWarningMessage(`Shorthands not found in ${type}LIB settings: ${missing.join(', ')}.`);
    }

    const text = document.getText();
    const lines = text.split(/\r?\n/);
    
    // 1. Find boundaries: JOB card and first EXEC
    let jobCardIndex = -1;
    let firstExecIndex = lines.length;
    for (let i = 0; i < lines.length; i++) {
        if (jobCardIndex === -1 && lines[i].startsWith('//') && lines[i].includes(' JOB ')) {
            jobCardIndex = i;
        }
        if (jobCardIndex !== -1 && lines[i].startsWith('//') && !lines[i].startsWith('//*') && lines[i].includes(' EXEC ')) {
            firstExecIndex = i;
            break;
        }
    }

    if (jobCardIndex === -1) {
        vscode.window.showErrorMessage('Could not find a JOB card.');
        return;
    }

    // 2. Identify all line ranges to be removed for the target type
    const rangesToRemove: {start: number, end: number}[] = [];
    const commentsToPreserve: string[] = [];
    let currentRange: {start: number, end: number} | null = null;
    let inBlock = false;
    let openParens = 0;

    for (let i = jobCardIndex + 1; i < firstExecIndex; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const isComment = line.startsWith('//*');
        const isJcl = line.startsWith('//') && !isComment;

        // Check if a new block of OUR type starts here
        let isOurMaster = false;
        if (isJcl) {
            if (type === 'JOB' && trimmed.startsWith('//JOBLIB')) isOurMaster = true;
            if (type === 'PROC') {
                if (trimmed.startsWith('//PROCLIB') || (trimmed.includes('JCLLIB') && trimmed.includes('ORDER'))) isOurMaster = true;
            }
        }

        // Special check for JOBLIB orphan (only if it's the very first active JCL after JOB)
        if (type === 'JOB' && !isOurMaster && isJcl && line.match(/^\/\/\s+DD\s/)) {
            let prevActive = false;
            for (let k = jobCardIndex + 1; k < i; k++) if (lines[k].startsWith('//') && !lines[k].startsWith('//*')) prevActive = true;
            if (!prevActive) isOurMaster = true;
        }

        if (isOurMaster) {
            if (currentRange) rangesToRemove.push(currentRange);
            currentRange = { start: i, end: i };
            inBlock = true;
            // Handle parens for JCLLIB
            if (type === 'PROC' && trimmed.includes('ORDER')) {
                openParens = (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
            } else {
                openParens = 0;
            }
            continue;
        }

        // If we are currently inside a range of our type, decide if we continue
        if (inBlock && currentRange) {
            let shouldContinue = false;
            if (isComment) {
                shouldContinue = true;
                commentsToPreserve.push(line);
            } else if (isJcl) {
                // Continuation DD or multi-line JCLLIB (parens still open)
                if (line.match(/^\/\/\s+DD\s/) || (type === 'PROC' && openParens > 0)) {
                    shouldContinue = true;
                    if (type === 'PROC') {
                        openParens += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
                    }
                }
            }

            if (shouldContinue) {
                currentRange.end = i;
            } else {
                rangesToRemove.push(currentRange);
                currentRange = null;
                inBlock = false;
            }
        }
    }
    if (currentRange) rangesToRemove.push(currentRange);

    // 3. Prepare the new library block
    const finalNewLines: string[] = [];
    if (type === 'JOB') {
        const ddName = 'JOBLIB';
        libraryNames.forEach((name, idx) => {
            const prefix = idx === 0 ? `//${ddName.padEnd(8)}` : '//        ';
            finalNewLines.push(`${prefix} DD DSN=${name},DISP=SHR`);
        });
    } else {
        if (libraryNames.length === 1) {
            finalNewLines.push(`// JCLLIB ORDER=(${libraryNames[0]})`);
        } else {
            finalNewLines.push(`// JCLLIB ORDER=(${libraryNames[0]},`);
            for (let i = 1; i < libraryNames.length; i++) {
                const suffix = i === libraryNames.length - 1 ? ')' : ',';
                finalNewLines.push(`//               ${libraryNames[i]}${suffix}`);
            }
        }
    }
    const replacementText = [...finalNewLines, ...commentsToPreserve].join('\n') + '\n';

    // 4. Perform the edit
    await editor.edit(editBuilder => {
        if (rangesToRemove.length > 0) {
            // Delete all identified ranges
            rangesToRemove.forEach(r => {
                const range = new vscode.Range(new vscode.Position(r.start, 0), new vscode.Position(r.end + 1, 0));
                editBuilder.delete(range);
            });
            // Insert the new block at the start of the first removed range
            editBuilder.insert(new vscode.Position(rangesToRemove[0].start, 0), replacementText);
        } else {
            // Default insertion: after JOB card and immediate comments
            let insertIdx = jobCardIndex + 1;
            while (insertIdx < lines.length && (lines[insertIdx].startsWith('//*') || lines[insertIdx].startsWith('/*'))) {
                insertIdx++;
            }
            editBuilder.insert(new vscode.Position(insertIdx, 0), replacementText);
        }
    });
}

async function bulkImport() {
    const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        openLabel: 'Import Mappings',
        filters: { 'Text/CSV': ['txt', 'csv'] }
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (!fileUri || fileUri.length === 0) return;

    const content = await vscode.workspace.fs.readFile(fileUri[0]);
    const text = new TextDecoder().decode(content);
    const lines = text.split(/\r?\n/);

    const jobMappings: Record<string, string> = {};
    const procMappings: Record<string, string> = {};

    lines.forEach(line => {
        const parts = line.split(/[=,:]/);
        if (parts.length === 2) {
            // Default to JOB if type missing
            jobMappings[parts[0].trim().toUpperCase()] = parts[1].trim().toUpperCase();
        } else if (parts.length >= 3) {
            const key = parts[0].trim().toUpperCase();
            const type = parts[1].trim().toUpperCase();
            const val = parts[2].trim().toUpperCase();
            if (type.includes('PROC')) {
                procMappings[key] = val;
            } else {
                jobMappings[key] = val;
            }
        }
    });

    const mode = await vscode.window.showQuickPick(['Merge', 'Overwrite'], {
        placeHolder: 'Merge with or Overwrite current mappings?'
    });
    if (!mode) return;

    const config = vscode.workspace.getConfiguration('jclLibraryManager');
    const target = vscode.ConfigurationTarget.Global;

    if (mode === 'Merge') {
        const curJob = config.get<Record<string, string>>('joblibMappings') || {};
        const curProc = config.get<Record<string, string>>('proclibMappings') || {};
        await config.update('joblibMappings', { ...curJob, ...jobMappings }, target);
        await config.update('proclibMappings', { ...curProc, ...procMappings }, target);
    } else {
        await config.update('joblibMappings', jobMappings, target);
        await config.update('proclibMappings', procMappings, target);
    }

    vscode.window.showInformationMessage(`Imported ${Object.keys(jobMappings).length} JOBLIB and ${Object.keys(procMappings).length} PROCLIB mappings.`);
}

export function deactivate() {}
