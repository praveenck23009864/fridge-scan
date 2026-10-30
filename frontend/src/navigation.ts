import {useEffect, useState, type MouseEvent} from 'react';

export const pagePaths = {dashboard: '/', scan: '/scan', inventory: '/inventory', recipes: '/recipes', shopping: '/shopping'} as const;
export type Page = keyof typeof pagePaths;

function currentPage(): Page {
  const legacy = window.location.hash.slice(1);
  if (Object.hasOwn(pagePaths, legacy)) return legacy as Page;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return (Object.keys(pagePaths) as Page[]).find(page => pagePaths[page] === path) ?? 'dashboard';
}

// Small same-origin router: real URLs, browser history, and legacy hash bookmarks.
// Pages stay mounted after visiting so navigation never discards an editor's draft.
export function useNavigation() {
  const [page, setPage] = useState(currentPage);
  const [inventoryVisited, setInventoryVisited] = useState(() => currentPage() === 'inventory');
  useEffect(() => {
    function sync() {
      const next = currentPage();
      if (Object.hasOwn(pagePaths, window.location.hash.slice(1))) {
        window.history.replaceState(null, '', pagePaths[next] + window.location.search);
      }
      setPage(next);
      if (next === 'inventory') setInventoryVisited(true);
    }
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  function followLink(event: MouseEvent<HTMLElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    if (url.origin !== window.location.origin || url.hash) return;
    const next = (Object.keys(pagePaths) as Page[]).find(key => pagePaths[key] === url.pathname);
    if (!next) return;
    event.preventDefault();
    if (window.location.pathname + window.location.search !== url.pathname + url.search) {
      window.history.pushState(null, '', url.pathname + url.search);
    }
    setPage(next);
    if (next === 'inventory') setInventoryVisited(true);
    document.getElementById('main-content')?.focus({preventScroll: true});
    window.scrollTo({top: 0, behavior: 'instant'});
  }
  return {page, inventoryVisited, followLink};
}
