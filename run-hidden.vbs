' Runs dozone-sync.js without showing a console window (used by the 5-minute check task).
' Any arguments are passed through to dozone-sync.js. Output goes to sync.log in this folder.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
args = ""
For i = 0 To WScript.Arguments.Count - 1
  args = args & " " & WScript.Arguments(i)
Next
sh.Run "cmd /c cd /d """ & dir & """ && node dozone-sync.js" & args & " >> sync.log 2>&1", 0, False
