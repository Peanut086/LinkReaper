chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkReaper extension installed');
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'popup.html' });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkLink') {
    checkLinkStatus(request.url).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ status: 'error', error: error.message });
    });
    return true;
  }
});

async function checkLinkStatus(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    return {
      status: 'valid',
      url: url
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        status: 'timeout',
        url: url
      };
    }
    return {
      status: 'invalid',
      url: url,
      error: error.message
    };
  }
}
