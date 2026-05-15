Attribute VB_Name = "datatransfer"
Sub TransferData()
    Dim ws As Worksheet
    Dim wb As Workbook
    Dim postpath As String
    Dim postbook As Workbook
    Dim postsheet As Worksheet
    Dim reportday As String
    Dim readcolumn As Range
    Dim postcolumn As Range
    Dim postcomment As Range
    Dim productivity() As Double
    Dim timevals() As String
    Dim comment As String
    Dim attempts As Integer
    Dim i As Integer
    Dim response As VbMsgBoxResult
    
    'Set current worksheet and workbook
    Set ws = ActiveSheet
    Set wb = ThisWorkbook
    
    'Get post path and report day
    postpath = ws.Range("K3").Value
    reportday = ws.Range("C31").Value
    
    'Find read column (D:H where row 31 = TRUE)
    For i = 4 To 8 'Columns D to H
        If ws.Cells(31, i).Value = True Then
            Set readcolumn = ws.Columns(i)
            Exit For
        End If
    Next i
    
    'Open postbook with retry
    attempts = 0
    Do
        On Error Resume Next
        Set postbook = Workbooks.Open(postpath)
        On Error GoTo 0
        
        attempts = attempts + 1
        If postbook Is Nothing And attempts < 3 Then
            Application.Wait Now + TimeValue("00:00:02")
        End If
    Loop Until Not postbook Is Nothing Or attempts >= 3
    
    If postbook Is Nothing Then
        MsgBox "Could not open target workbook after 3 attempts.", vbCritical
        Exit Sub
    End If
    
    'Set post sheet
    Set postsheet = postbook.Sheets("Charles")
    
    'Set postcolumn based on day
    Select Case reportday
        Case "Monday"
            Set postcolumn = postsheet.Columns("B")
            Set postcomment = postsheet.Range("B26")
        Case "Tuesday"
            Set postcolumn = postsheet.Columns("C")
            Set postcomment = postsheet.Range("B28")
        Case "Wednesday"
            Set postcolumn = postsheet.Columns("D")
            Set postcomment = postsheet.Range("B30")
        Case "Thursday"
            Set postcolumn = postsheet.Columns("E")
            Set postcomment = postsheet.Range("B32")
        Case "Friday"
            Set postcolumn = postsheet.Columns("F")
            Set postcomment = postsheet.Range("B34")
    End Select
    
    'Read data
    ReDim productivity(1 To 13)
    ReDim timevals(1 To 2)
    
    For i = 1 To 13
        productivity(i) = readcolumn.Cells(33 + i).Value
    Next i
    
    For i = 1 To 2
        timevals(i) = readcolumn.Cells(48 + i).Text
    Next i
    
    comment = readcolumn.Cells(51).Value
    
    'Write productivity with confirmation if data exists
    For i = 1 To 13
        If Not IsEmpty(postcolumn.Cells(6 + i)) Then
            response = MsgBox("Overwrite existing productivity data in row " & (6 + i) & "?", vbYesNo)
            If response = vbNo Then GoTo SkipProd
        End If
        postcolumn.Cells(6 + i).Value = productivity(i)
SkipProd:
    Next i
    
    'Write time with confirmation if data exists
    For i = 1 To 2
        If Not IsEmpty(postcolumn.Cells(21 + i)) Then
            response = MsgBox("Overwrite existing time data in row " & (21 + i) & "?", vbYesNo)
            If response = vbNo Then GoTo SkipTime
        End If
        postcolumn.Cells(21 + i).Value = timevals(i)
SkipTime:
    Next i
    
    'Write comment with confirmation if data exists
    If Not IsEmpty(postcomment) Then
        response = MsgBox("Overwrite existing comment?", vbYesNo)
        If response = vbYes Then
            postcomment.Value = comment
        End If
    Else
        postcomment.Value = comment
    End If
    
    'Ask to save and close
    response = MsgBox("Save and close target workbook?", vbYesNo)
    If response = vbYes Then
        postbook.Close True
    End If
    
    'Return focus
    ws.Activate
End Sub
