type RouterLike = {
  push: (href: string) => void;
};

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

export function pushWithViewTransition(router: RouterLike, href: string): void {
  if (typeof document === 'undefined') {
    router.push(href);
    return;
  }
  const doc = document as DocumentWithViewTransition;
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(() => {
      router.push(href);
    });
    return;
  }
  router.push(href);
}
