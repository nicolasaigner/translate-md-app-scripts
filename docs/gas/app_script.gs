function doPost(e) {
  try {
    // Pega os parâmetros do corpo da requisição POST
    var text = e.parameter.text;
    var source = e.parameter.source || "en";
    var target = e.parameter.target || "pt";

    // Usa o motor interno do Google
    var translatedText = LanguageApp.translate(text, source, target);

    // Retorna o resultado em JSON
    return ContentService.createTextOutput(JSON.stringify({ translated: translatedText })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}