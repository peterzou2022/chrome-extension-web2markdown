import '@src/Popup.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';

const Popup = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const logo = isLight ? 'popup/logo_vertical.svg' : 'popup/logo_vertical_dark.svg';

  const openSidePanel = async () => {
    const win = await chrome.windows.getCurrent();
    if (win?.id != null) {
      try {
        await chrome.sidePanel.open({ windowId: win.id });
      } catch (err) {
        console.error('Failed to open side panel:', err);
      }
    }
  };

  return (
    <div className={cn('App', isLight ? 'bg-slate-50' : 'bg-gray-800')}>
      <header className={cn('App-header', isLight ? 'text-gray-900' : 'text-gray-100')}>
        <img src={chrome.runtime.getURL(logo)} className="App-logo" alt="logo" />
        <p className="text-sm">文章总结 · 知识库</p>
        <button
          type="button"
          className={cn(
            'mt-4 rounded px-4 py-1 font-bold shadow hover:scale-105',
            isLight ? 'bg-blue-200 text-black' : 'bg-gray-700 text-white',
          )}
          onClick={openSidePanel}>
          打开侧边栏
        </button>
        <ToggleButton>主题</ToggleButton>
      </header>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
