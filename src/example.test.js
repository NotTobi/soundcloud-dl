describe("suite", () => {
  it("test", () => {
    chrome.downloads.download({ url: "test", saveAs: false, filename: "test.html" });

    expect(0).equal(0);
  });
});
