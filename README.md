# JCL JOBLIB Manager

Quickly update JCL JOBLIB statements using shorthand names.

## Features
- **Smart Update:** Updates active JOBLIB statements while preserving your comments and "zombie" JCL.
- **Shorthand Support:** Use custom shorthands (e.g., `DEV`, `PROD`) defined in your settings.
- **Bulk Import:** Import large lists of mappings from external files (CSV/Text).
- **Auto-Formatting:** Automatically adds `DSN=` and `DISP=SHR` to your library names.
- **Case Insensitive:** Handles mixed-case input and normalizes output to uppercase.
- **Customizable Scope:** Configure which file extensions the extension should run on.

## How to Use

### Updating JOBLIBs
1. Open a JCL or supported text file.
2. **Right-click** in the editor and select **JCL: Update JOBLIB** (or use the Command Palette `Ctrl+Shift+P`).
3. Enter your shorthand names separated by spaces (e.g., `dev prod test`).

### Bulk Importing Mappings
1. Prepare a text file with your mappings in one of these formats:
   - `DEV,SYS1.DEV.LIB`
   - `PROD=SYS1.PROD.LIB`
   - `TEST:SYS1.TEST.LIB`
2. Open the Command Palette (`Ctrl+Shift+P`).
3. Search for **JCL: Bulk Import Mappings**.
4. Select your file and choose whether to **Merge** or **Overwrite** your current list.

## Configuration
Access these via `Settings` -> `Extensions` -> `JCL JOBLIB Manager`:

- `mappings`: The dictionary of shorthand names to library DSNs.
- `supportedExtensions`: A list of file extensions where the command is active (Default: `.jcl`, `.txt`).
