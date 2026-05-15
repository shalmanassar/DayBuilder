Attribute VB_Name = "Buttons"
Sub clearDATA()
Attribute clearDATA.VB_ProcData.VB_Invoke_Func = " \n14"
'
' clearDATA Macro
'

'
    Range("A1:H26").Select
    Range("H26").Activate
    Selection.ClearContents
    Range("N2").Select
    Selection.ClearContents
    Range("A1").Select
    
End Sub
Sub pasteclipboard()
'
' pasteclipboard Macro
'

'
    Range("A1").Select
    ActiveSheet.Paste
End Sub

Sub closeNOSAVE()
  ThisWorkbook.Close SaveChanges:=False
End Sub

Sub RESIZER()
    'Resize window
    Application.Width = 1260
    Application.Height = 470
    Application.WindowState = xlNormal
    
    'Hide ribbon
    Application.ExecuteExcel4Macro "SHOW.TOOLBAR(""Ribbon"",False)"
    
    'Hide formula bar
    Application.DisplayFormulaBar = False
    
    'Hide headings (row numbers and column letters)
    ActiveWindow.DisplayHeadings = False
    ActiveWindow.DisplayGridlines = False
End Sub

Public Sub CleanseAndImportData()
    Dim ws As Worksheet
    Dim tempRange As Range
    Dim dataStr As String
    Dim dataLines() As String
    Dim finalArr() As Variant
    Dim i As Long, j As Long, rows As Long
    
    Set ws = ThisWorkbook.Sheets("DATA")
    
    ' Clear and paste to temp area
    ws.Range("M39:T100").Clear
    ws.Range("M39").PasteSpecial xlPasteText
    Set tempRange = ws.Range("M39").CurrentRegion
    
    ' Convert range to array
    Dim dataArr As Variant
    dataArr = tempRange.Value
    
    ' Count rows (subtract 1 for header)
    rows = tempRange.rows.Count - 1
    ReDim finalArr(1 To rows, 1 To 8)
    
    ' Process rows - start at row 2 to skip header
    j = 1
    i = 2  ' Start at second row of dataArr
    Do While i <= UBound(dataArr)
        ' Copy current row
        finalArr(j, 1) = dataArr(i, 1)
        finalArr(j, 2) = dataArr(i, 2)
        finalArr(j, 3) = dataArr(i, 3)
        ' Convert times to numbers
        If IsDate(dataArr(i, 4)) Then
            finalArr(j, 4) = TimeValue(dataArr(i, 4))
        Else
            finalArr(j, 4) = dataArr(i, 4)
        End If
        If IsDate(dataArr(i, 5)) Then
            finalArr(j, 5) = TimeValue(dataArr(i, 5))
        Else
            finalArr(j, 5) = dataArr(i, 5)
        End If
        
        If UBound(dataArr, 2) >= 6 Then finalArr(j, 6) = dataArr(i, 6)
        If UBound(dataArr, 2) >= 7 Then finalArr(j, 7) = dataArr(i, 7)
        If UBound(dataArr, 2) >= 8 Then
            If IsNumeric(dataArr(i, 8)) Then
                finalArr(j, 8) = CLng(Val(dataArr(i, 8)))
            End If
        End If
        
        ' If column 7 is empty, check for continuation
        If Trim(CStr(finalArr(j, 7))) = "" Then
            ' If there's a next row
            If i < UBound(dataArr) Then
                ' If next row's column 1 is empty
                If Trim(CStr(dataArr(i + 1, 1))) = "" Then
                    ' If next row's column 2 is not empty
                    If Trim(CStr(dataArr(i + 1, 2))) <> "" Then
                        ' Move next row's columns 2 and 3 to current row's 7 and 8
                        finalArr(j, 7) = dataArr(i + 1, 2)
                        If UBound(dataArr, 2) >= 3 Then
                            If IsNumeric(dataArr(i + 1, 3)) Then
                                finalArr(j, 8) = CLng(Val(dataArr(i + 1, 3)))
                            End If
                        End If
                        i = i + 1 ' Skip next row
                    End If
                End If
            End If
        End If
        
        i = i + 1
        j = j + 1
    Loop
    
    ' Clear temporary paste area
    ws.Range("M39:T100").Clear
    
    ' Clear target area and output data
    ws.Range("A1").CurrentRegion.Clear
    
    ' Output data
    With ws.Range("A1").Resize(j - 1, 8)
        .Value = finalArr
        .Columns(2).NumberFormat = "yyyy-mm-dd"
        .Columns(4).NumberFormat = "hh:mm:ss"
        .Columns(5).NumberFormat = "h:mm:ss"
        .Columns(8).NumberFormat = "0"
    End With
    
    ' Force numeric conversion for quantities
    With ws.Range("A1").Resize(j - 1, 8).Columns(8)
        .Value = .Value
        .NumberFormat = "0"
    End With
End Sub
