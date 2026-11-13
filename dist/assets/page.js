// Behaviour for the reverse_proxy redesign page. No dependencies.
(function () {
	const $ = (s, r = document) => r.querySelector(s);
	const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
	const store = {
		get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
		set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
	};

	// theme: system → light → dark
	const themes = ['system', 'light', 'dark'];
	let theme = store.get('caddy-theme') || 'system';
	const applyTheme = () => {
		if (theme === 'system') document.documentElement.removeAttribute('data-theme');
		else document.documentElement.setAttribute('data-theme', theme);
		const name = theme[0].toUpperCase() + theme.slice(1);
		$('#current-theme').textContent = name;
		$('#theme-btn').setAttribute('aria-label', 'Theme: ' + name);
	};
	applyTheme();
	$('#theme-btn').addEventListener('click', () => { theme = themes[(themes.indexOf(theme) + 1) % 3]; store.set('caddy-theme', theme); applyTheme(); });

	// drawer
	const closeNav = () => document.body.classList.remove('nav-open');
	$('#menu-btn').addEventListener('click', () => { document.body.classList.add('nav-open'); $('.cd-sidebar [aria-current="page"]')?.scrollIntoView({ block: 'center' }); });
	$('#nav-close').addEventListener('click', closeNav);
	$('#scrim').addEventListener('click', closeNav);
	document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });

	// keep the current page visible in the sidebar
	const current = $('.cd-sidebar [aria-current="page"]');
	const side = $('#side');
	if (current && side && innerWidth > 900) side.scrollTop = current.offsetTop - side.clientHeight / 3;

	// sidebar filter
	const filter = $('#nav-filter');
	filter.addEventListener('input', () => {
		const q = filter.value.trim().toLowerCase();
		let any = false;
		$$('.cd-sidebar li').forEach(li => {
			const own = li.querySelector(':scope > a').textContent.toLowerCase();
			const childHit = $$(':scope > ul > li', li).some(c => c.textContent.toLowerCase().includes(q));
			const hit = !q || own.includes(q) || childHit;
			li.hidden = !hit;
			if (hit && (!q || own.includes(q))) any = true;
		});
		$$('.cd-sidebar .nav-section').forEach(s => { s.hidden = !!q && !$$('li', s).some(li => !li.hidden); });
		$('.nav-empty').hidden = !q || any || $$('.cd-sidebar li').some(li => !li.hidden);
	});

	// code blocks: copy + overflow cue
	$$('.cd-code').forEach(block => {
		const pre = $('pre', block), scroll = $('.cd-code__scroll', block), btn = $('.cd-code__copy', block);
		btn.addEventListener('click', async () => {
			const text = pre.innerText.replace(/\n$/, '');
			let ok = true;
			try { await navigator.clipboard.writeText(text); }
			catch (e) {
				const r = document.createRange(); r.selectNodeContents(pre);
				const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
				ok = false;
			}
			$('.label', btn).textContent = ok ? 'Copied' : 'Press Ctrl C';
			setTimeout(() => { $('.label', btn).textContent = 'Copy'; }, 1600);
		});
		const expand = $('.cd-code__expand', block);
		if (expand) expand.addEventListener('click', () => {
			const collapsed = block.classList.toggle('is-collapsed');
			expand.setAttribute('aria-expanded', String(!collapsed));
			$('span', expand).textContent = collapsed ? `Expand · ${expand.dataset.lines} lines` : 'Collapse';
			if (collapsed && block.getBoundingClientRect().top < 0) block.scrollIntoView({ block: 'start' });
			update();
		});
		const update = () => scroll.classList.toggle('is-clipped', pre.scrollWidth - pre.clientWidth - pre.scrollLeft > 4);
		pre.addEventListener('scroll', update, { passive: true });
		if ('ResizeObserver' in window) new ResizeObserver(update).observe(pre);
		update();
	});

	// outline scroll-spy (desktop outline + mobile dropdown)
	const outlineLinks = $$('.outline-col .cd-outline a');
	const mobileLinks = $$('.toc-mobile .cd-outline a');
	const label = $('.toc-mobile .current');
	const heads = outlineLinks.map(a => document.getElementById(a.hash.slice(1))).filter(Boolean);
	let ticking = false;
	const spy = () => {
		ticking = false;
		let idx = 0;
		heads.forEach((h, i) => { if (h.getBoundingClientRect().top < 120) idx = i; });
		if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) idx = heads.length - 1;
		[outlineLinks, mobileLinks].forEach(list => list.forEach((a, i) => i === idx ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
		if (label) label.textContent = scrollY > 300 && outlineLinks[idx] ? '· ' + outlineLinks[idx].textContent : '';
		const col = $('.outline-col'), a = outlineLinks[idx];
		if (col && a && col.offsetParent) {
			const r = a.getBoundingClientRect(), b = col.getBoundingClientRect();
			if (r.top < b.top + 40 || r.bottom > b.bottom - 40) col.scrollTop += r.top - b.top - b.height / 3;
		}
	};
	addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
	spy();
	mobileLinks.forEach(a => a.addEventListener('click', () => { $('.toc-mobile').open = false; }));

	// search (concept): page titles + every option + headings
	const dlg = $('#search-dialog'), input = $('#search-input'), results = $('.results', dlg);
	const index = [];
	$$('.cd-sidebar a').forEach(a => index.push({ t: a.textContent.trim(), w: 'Docs page', h: a.getAttribute('href') }));
	$$('.cd-option').forEach(li => index.push({ t: $('.cd-option__name', li).textContent, w: 'reverse_proxy › ' + (li.dataset.section || 'option'), h: '#' + li.id }));
	$$('.article [id].cd-h2, .article [id].cd-h3').forEach(h => index.push({ t: h.textContent.replace('#', '').trim(), w: 'reverse_proxy section', h: '#' + h.id }));
	let sel = 0;
	const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
	const render = () => {
		const q = input.value.trim().toLowerCase();
		const hits = q ? index.filter(x => x.t.toLowerCase().includes(q)).sort((a, b) => a.t.toLowerCase().indexOf(q) - b.t.toLowerCase().indexOf(q)).slice(0, 12) : [];
		sel = 0;
		results.innerHTML = hits.map((x, i) => `<li><a href="${x.h}"${i === 0 ? ' class="sel"' : ''}>${escHtml(x.t)}<small>${escHtml(x.w)}</small></a></li>`).join('');
		$('.hint', dlg).hidden = hits.length > 0;
	};
	const open = () => { closeNav(); if (!dlg.open) dlg.showModal(); input.value = ''; render(); input.focus(); };
	$$('[data-open-search]').forEach(b => b.addEventListener('click', open));
	$('[data-close-search]').addEventListener('click', () => dlg.close());
	dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
	results.addEventListener('click', e => { if (e.target.closest('a')) dlg.close(); });
	input.addEventListener('input', render);
	input.addEventListener('keydown', e => {
		const items = $$('a', results);
		if (!items.length) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault(); items[sel].classList.remove('sel');
			sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
			items[sel].classList.add('sel'); items[sel].scrollIntoView({ block: 'nearest' });
		} else if (e.key === 'Enter') { e.preventDefault(); items[sel].click(); }
	});
	document.addEventListener('keydown', e => {
		const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
		if ((e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); open(); }
	});
})();
