' Starts the program server without a window and writes its messages to sunucu-kayit.txt.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
sh.Run "cmd /c """"" & here & "\baslat.bat"" > """ & here & "\sunucu-kayit.txt"" 2>&1""", 0, False
