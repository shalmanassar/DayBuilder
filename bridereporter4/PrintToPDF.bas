Attribute VB_Name = "PrintToPDF"
Sub PrintReportToPDFWithDynamicFilename()

    Dim wsReport As Worksheet
    Dim dataSheet As Worksheet
    Dim filenameCell As Range
    Dim pdfFilename As String
    Dim savePath As String
    Dim fullSavePath As String

    ' --- Configuration ---

    ' Set the worksheet containing the report you want to print
    ' Replace "Sheet1" with the actual name of your report sheet
    Set wsReport = ThisWorkbook.Sheets("brief")
    Set dataSheet = ThisWorkbook.Sheets("DATA")
    
    ' Set the cell containing the desired filename (e.g., "A1")
    ' Replace "A1" with the actual cell address
    Set filenameCell = dataSheet.Range("K2")

    ' --- End Configuration ---

    ' Get the filename from the specified cell
    pdfFilename = filenameCell.Text

    ' Check if the filename is empty
    If pdfFilename = "" Then
        MsgBox "The filename cell is empty. Please enter a filename.", vbExclamation
        Exit Sub
    End If

    ' Define the save path (same directory as the workbook)
    savePath = "W:\My Documents\BridgeReports"

    ' Add a backslash if the workbook is not saved at the root of a drive
    If Right(savePath, 1) <> "\" Then
        savePath = savePath & "\"
    End If

    ' Create the full save path including the filename and extension
    fullSavePath = savePath & pdfFilename & ".pdf"

    ' --- Export the sheet as PDF ---

    On Error GoTo ErrorHandler

    wsReport.ExportAsFixedFormat _
        Type:=xlTypePDF, _
        Filename:=fullSavePath, _
        Quality:=xlQualityStandard, _
        IncludeDocProperties:=True, _
        IgnorePrintAreas:=False, _
        OpenAfterPublish:=False ' Set to True if you want to open the PDF after creation

    MsgBox "Report successfully saved as:" & vbCrLf & fullSavePath, vbInformation

    Exit Sub

ErrorHandler:
    MsgBox "An error occurred while saving the PDF." & vbCrLf & _
           "Error Number: " & Err.Number & vbCrLf & _
           "Error Description: " & Err.Description, vbCritical

End Sub

