' Runs dozone-sync.js without showing a console window (used by the 5-minute check task).
' Usage: wscript.exe run-hidden.vbs ["C:\...\node.exe"] <args for dozone-sync.js>
' If the first argument ends with node.exe it is used as the Node program (so PATH does not matter);
' otherwise "node" from PATH is used. Output goes to sync.log in this folder.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
node = "node"
args = ""
For i = 0 To WScript.Arguments.Count - 1
  a = WScript.Arguments(i)
  If i = 0 And LCase(Right(a, 8)) = "node.exe" Then
    node = a
  Else
    args = args & " " & a
  End If
Next
On Error Resume Next
Set f = fso.OpenTextFile(dir & "\sync.log", 8, True)
f.WriteLine Now & " check start (" & node & ")"
f.Close
On Error GoTo 0
sh.Run "cmd /c cd /d """ & dir & """ && """ & node & """ dozone-sync.js" & args & " >> sync.log 2>&1", 0, False
