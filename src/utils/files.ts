/**
 * Downloads a file from the Slack URL and returns it as a buffer
 */
export async function downloadUserUploadedFile(url: string) {
  const pdfWebResponse = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
  });
  return Buffer.from(await pdfWebResponse.arrayBuffer());
}
