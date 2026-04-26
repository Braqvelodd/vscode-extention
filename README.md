# JCL Library Manager

Quickly update JCL JOBLIB and PROCLIB statements using shorthand names.

## Features
- **Smart Update:** Updates active JOBLIB, PROCLIB, or JCLLIB ORDER statements while preserving your comments.
- **JOBLIB & PROCLIB Support:** Separate mappings for job and procedure libraries.
- **JCLLIB ORDER Handling:** Detects and maintains multi-line `JCLLIB ORDER=(...)` blocks.
- **Bulk Import:** Import large lists of mappings using a simple format: `SHORTHAND,TYPE,VALUE`.
- **Auto-Formatting:** Automatically adds `DSN=` and `DISP=SHR`.
- **Customizable Scope:** Configure which file extensions the extension should run on.

## How to Use

### Updating Libraries
1. Open a JCL or supported text file.
2. **Right-click** and select **JCL: Update JOBLIB** or **JCL: Update PROCLIB**.
3. Enter your shorthand names (e.g., `dev prod`).

### Bulk Importing Mappings
Prepare a text file with your mappings:
```text
DEV,JOB,SYS1.DEV.LINKLIB
PROD,JOB,SYS1.PROD.LINKLIB
DEV,PROC,SYS1.DEV.PROCLIB
PROD,PROC,SYS1.PROD.PROCLIB
```
1. Run **JCL: Bulk Import Mappings** from the Command Palette.
2. Select your file and choose **Merge** or **Overwrite**.

## Configuration
Go to `Settings` -> `Extensions` -> `JCL Library Manager`:

- `joblibMappings`: Shorthands for JOBLIB.
- `proclibMappings`: Shorthands for PROCLIB.
- `supportedExtensions`: File extensions allowed (Default: `.jcl`, `.txt`).
