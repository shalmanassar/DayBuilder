Attribute VB_Name = "REPORTSTUFF"
Sub ClearAndRepopulateReportOptimized()
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    

    Dim ws As Worksheet
    Dim rng As Range
    Dim lastRow As Long
    Dim i As Long
    Dim reportLastRow As Long

    ' Clear everything on the "report" sheet
    Set ws = ThisWorkbook.Sheets("report")
    ws.Cells.Clear

    ' Copy date from "Main" sheet to "report" sheet A1
    Set ws = ThisWorkbook.Sheets("Main")
    ThisWorkbook.Sheets("report").Range("A1").Value = ws.Range("A1").Value

    ' Add title "CHRLSIM Bridge Report" in B1 and format
    ThisWorkbook.Sheets("report").Range("B1").Value = "CHRLSIM Bridge Report"
    With ThisWorkbook.Sheets("report").Range("B1").Font
        .Bold = True
        .Size = 14 ' Modify the font size as needed
    End With

    ' Add a page break after line 14
    ThisWorkbook.Sheets("report").HPageBreaks.Add Before:=ThisWorkbook.Sheets("report").rows(45)

    ' Copy data from "Main" sheet to "report" sheet
    lastRow = ws.UsedRange.rows.Count
    For i = 1 To lastRow
        ' Find the next empty row in the "report" sheet
        reportLastRow = ThisWorkbook.Sheets("report").Cells(ThisWorkbook.Sheets("report").rows.Count, "B").End(xlUp).Row + 1
        ' Copy the row to the "report" sheet
        ws.rows(i).Copy
        With ThisWorkbook.Sheets("report").rows(reportLastRow)
            .PasteSpecial Paste:=xlPasteValues
            .PasteSpecial Paste:=xlPasteFormats
        End With
    Next i

    ' Copy data from "SIMday" sheet to "report" sheet
    Set ws = ThisWorkbook.Sheets("SIMday")
    lastRow = ws.Cells(ws.rows.Count, "B").End(xlUp).Row
    For i = 1 To lastRow
        ' Check if the row is truly empty
        If Application.CountA(ws.rows(i)) <> 0 Then
            ' Find the next empty row in the "report" sheet
            reportLastRow = ThisWorkbook.Sheets("report").Cells(ThisWorkbook.Sheets("report").rows.Count, "B").End(xlUp).Row + 1
            ' Copy the row to the "report" sheet
            ws.rows(i).Copy
            With ThisWorkbook.Sheets("report").rows(reportLastRow)
                .PasteSpecial Paste:=xlPasteValues
                .PasteSpecial Paste:=xlPasteFormats
            End With
        End If
    Next i

    Application.CutCopyMode = False
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True

    ThisWorkbook.Sheets("report").Activate
    'ActiveSheet.UsedRange.Columns.AutoFit
    ActiveSheet.UsedRange.rows.AutoFit
End Sub

Sub copyPercentDate()
    Dim wsMain As Worksheet
    Dim wsPdcount As Worksheet
    Dim lastRow As Long
    Dim percentValue As Variant
    Dim dateValue As Variant
    Dim found As Range

    ' Set references to the worksheets
    Set wsMain = ThisWorkbook.Sheets("Main")
    Set wsPdcount = ThisWorkbook.Sheets("pdcount")

    ' Get the values from the Main sheet
    percentValue = wsMain.Range("L3").Value
    dateValue = wsMain.Range("B44").Value

    ' Check if dateValue already exists in column U on the pdcount sheet
    Set found = wsPdcount.Columns("U").Find(What:=dateValue, LookIn:=xlValues, LookAt:=xlWhole)

    If Not found Is Nothing Then
        ' If dateValue is found, overwrite the existing row with the new data
        wsPdcount.Range("U" & found.Row).Value = dateValue
        wsPdcount.Range("V" & found.Row).Value = percentValue
    Else
        ' If dateValue is not found, append the new data to the next available row
        lastRow = wsPdcount.Cells(wsPdcount.rows.Count, "U").End(xlUp).Row + 1
        wsPdcount.Range("U" & lastRow).Value = dateValue
        wsPdcount.Range("V" & lastRow).Value = percentValue
    End If
End Sub




