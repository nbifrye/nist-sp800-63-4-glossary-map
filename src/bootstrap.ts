import('./site/main.ts').catch(() => {
  const status = document.querySelector<HTMLElement>('#startup-status')!;
  status.hidden = false; status.setAttribute('role', 'alert');
  status.firstElementChild!.textContent = 'サイトを読み込めませんでした。再読み込みしてください。';
});
