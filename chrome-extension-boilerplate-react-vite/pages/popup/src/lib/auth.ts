export async function signInWithGoogle(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!chrome?.identity) {
      reject('Chrome identity API not available')
      return
    }
    chrome.identity.getAuthToken({ interactive: true }, (result: any) => {
      console.log('getAuthToken result:', JSON.stringify(result))
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError?.message ?? 'Auth failed')
        return
      }
      const token = typeof result === 'string' ? result : result?.token
      if (!token) {
        reject('No token received')
        return
      }
      resolve(token)
    })
  })
}

export async function getGoogleToken(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!chrome?.identity) {
      resolve(null)
      return
    }
    chrome.identity.getAuthToken({ interactive: false }, (result: any) => {
      if (chrome.runtime.lastError) {
        resolve(null)
        return
      }
      const token = typeof result === 'string' ? result : result?.token
      resolve(token ?? null)
    })
  })
}