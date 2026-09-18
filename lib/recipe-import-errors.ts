export function recipeImportFailureMessage(errorMessage: string | undefined) {
  if (errorMessage?.includes("did not find a complete recipe")) {
    return "We couldn’t read a complete recipe from that page.";
  }
  if (errorMessage?.includes("firecrawl_request_failed")) {
    return "We couldn’t scrape a complete recipe from that website.";
  }
  return "We couldn’t read a complete recipe from that page.";
}
