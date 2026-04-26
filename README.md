# JCL Library Manager

Quickly update JCL JOBLIB, PROCLIB, and JOB cards using shorthand names and skeletons.

## Features
- **Smart Library Update:** Updates active JOBLIB, PROCLIB, or JCLLIB ORDER statements while preserving comments.
- **Header Cleanup:** Automatically removes redundant or duplicate library blocks between the JOB card and the first EXEC.
- **Custom JOB Card:** Replace your Job Card with a custom multi-line skeleton.
- **Dynamic Variables:** Support for `{jobName}` preservation and `{@@}` random character generation.
- **Bulk Import:** Import mapping lists from CSV/Text files.

## How to Use

### Updating Libraries
1. Open a JCL or supported text file.
2. **Right-click** and select **JCL: Update JOBLIB** or **JCL: Update PROCLIB**.
3. Enter your shorthand names (e.g., `dev prod`).

### Updating Job Cards
1. **Right-click** and select **JCL: Update Job Card**.
2. An input box will appear for optional overrides. You can use two styles:

   **Positional Style:** (Order: CLASS, MSGCLASS, REGION, NOTIFY, TYPRUN)
   - `. . 4M` (Skips Class/MsgClass, sets Region to 4M)
   - `C X 0M Y` (Sets Class=C, MsgClass=X, Region=0M, Notify=YES)

   **Keyed Style:**
   - `C=A MC=X R=4M N=Y T=HOLD`

   *Note: Use `.` or `_` to skip a positional argument. For Notify, use `Y` to enable `NOTIFY=&SYSUID`.*

### Bulk Importing Mappings
Prepare a text file with: `SHORTHAND,TYPE,VALUE`
```text
DEV,JOB,SYS1.DEV.LINKLIB
PROD,PROC,SYS1.PROD.PROCLIB
```
1. Run **JCL: Bulk Import Mappings** from the Command Palette.

## Configuration
Go to `Settings` -> `Extensions` -> `JCL Library Manager`:

- `jobCardSkeleton`: The multi-line template for your Job Card.
  - *Placeholders:* `{jobName}`, `{@@}`, `{class}`, `{msgclass}`, `{notify}`, `{typrun}`, `{region}`.
- `defaultClass` / `defaultMsgClass`: Baseline values for the Job Card.
- `joblibMappings` / `proclibMappings`: Your shorthand dictionaries.
