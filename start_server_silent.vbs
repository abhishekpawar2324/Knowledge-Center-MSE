' Magic Knowledge Center - Silent Background Launcher
' Runs the server invisibly in the background without keeping a command prompt window open.

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = ScriptDir
WshShell.Run "cmd /c deploy_vm.bat", 0, False

Set WshShell = Nothing
Set FSO = Nothing
