import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockedReason, boardLetter, canonicalUrl, componentCoverage, componentCoverageText, componentMatch, coverage, plannedComponents, coverageText, plannedSections, sectionId, rejectedInBrief, rejectionLine, imageSize, isFreePhotoPage, isInspirationHost, letterIndex, pageImages, pageTitle, robotsAllows, robotsRules } from '../src/server/references.ts';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('page images: share image first, gallery thumbnails upgraded to full size, no duplicates', () => {
  const dribbble = `<meta property="og:image" content="https://cdn.dribbble.com/userupload/123/file/original-a.png?resize=400x300&amp;vertical=center">
    <img src="https://cdn.dribbble.com/userupload/123/file/original-a.png?resize=1024x768"><img src="https://cdn.dribbble.com/userupload/124/file/b.jpg?resize=800x600">`;
  assert.deepEqual(pageImages(dribbble, 'https://dribbble.com/shots/1-x', 4), ['https://cdn.dribbble.com/userupload/123/file/original-a.png', 'https://cdn.dribbble.com/userupload/124/file/b.jpg']);

  const behance = '<meta property="og:image" content="https://mir-s3-cdn-cf.behance.net/projects/404/cover.png"><img src="https://mir-s3-cdn-cf.behance.net/project_modules/max_1200/abc.png">';
  assert.deepEqual(pageImages(behance, 'https://www.behance.net/gallery/1/x', 4), ['https://mir-s3-cdn-cf.behance.net/projects/original/cover.png', 'https://mir-s3-cdn-cf.behance.net/project_modules/max_3840/abc.png']);

  const awwwards = '<img srcset="https://assets.awwwards.com/awards/media/cache/thumb_440_330/submissions/2026/09/a.png 1x">';
  assert.deepEqual(pageImages(awwwards, 'https://www.awwwards.com/sites/x'), ['https://assets.awwwards.com/awards/submissions/2026/09/a.png']);

  assert.deepEqual(pageImages('<meta name="twitter:image" content="/og.png">', 'https://example.com/a/b'), ['https://example.com/og.png']);
  assert.deepEqual(pageImages('<p>nothing</p>', 'https://example.com'), []);
  assert.equal(pageTitle('<title> Clinic &amp; Care\n landing </title>'), 'Clinic & Care landing');
});

test('blocked pages are recognized, not mistaken for content', () => {
  assert.match(blockedReason(403, 'denied', 'https://www.behance.net/x')!, /403/);
  assert.match(blockedReason(202, '<html>challenge</html>', 'https://dribbble.com/x')!, /bot check/);
  assert.match(blockedReason(200, '<html>ok</html>', 'https://site.com/login')!, /login/);
  assert.match(blockedReason(200, '<title>Just a moment...</title>', 'https://site.com/')!, /captcha/);
  assert.equal(blockedReason(200, '<html><title>Shot</title></html>', 'https://site.com/shots/1'), null);
});

test('robots.txt: own group over *, longest match wins, wildcards', () => {
  const txt = 'User-agent: *\nDisallow: /gallery/\nDisallow: *favourites?page\nAllow: /gallery/public\n\nUser-agent: OtherBot\nDisallow: /';
  const rules = robotsRules(txt);
  assert.equal(robotsAllows(rules, '/sites/x'), true);
  assert.equal(robotsAllows(rules, '/gallery/1'), false);
  assert.equal(robotsAllows(rules, '/gallery/public/1'), true);
  assert.equal(robotsAllows(rules, '/u/favourites?page=2'), false);
  assert.equal(robotsAllows(robotsRules('User-agent: figma-mcp\nDisallow: /\n\nUser-agent: *\nAllow: /'), '/a'), false);
  assert.equal(robotsAllows(robotsRules(''), '/a'), true);
});

test('hosts: galleries are references only; free photo pages resolve to photos', () => {
  assert.equal(isInspirationHost('https://cdn.dribbble.com/userupload/1/a.png'), true);
  assert.equal(isInspirationHost('https://i.pinimg.com/736x/a.jpg'), true);
  assert.equal(isInspirationHost('https://images.unsplash.com/photo-1'), false);
  assert.equal(isInspirationHost('/Users/me/dribbble.com.png'), false);
  assert.equal(isFreePhotoPage('https://unsplash.com/photos/cafe-1'), true);
  assert.equal(isFreePhotoPage('https://images.unsplash.com/photo-1'), false);
  assert.equal(isFreePhotoPage('https://example.com/photo'), false);
});

test('image size from header bytes; board letters', () => {
  assert.deepEqual(imageSize(PNG), { w: 1, h: 1 });
  assert.deepEqual(imageSize(Buffer.from('GIF89a\x10\x00\x08\x00', 'latin1')), { w: 16, h: 8 });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03]);
  assert.deepEqual(imageSize(jpg), { w: 800, h: 600 });
  assert.equal(imageSize(Buffer.from('nope')), null);
  assert.deepEqual([0, 1, 25, 26, 27].map(boardLetter), ['A', 'B', 'Z', 'AA', 'AB']);
  assert.deepEqual(['A – Shot (dribbble.com)', 'C - x', 'AB – y', 'Notes'].map(letterIndex), [0, 2, 27, -1]);
});

test('rejected references are read back from the brief, whatever the URL spelling', () => {
  assert.equal(canonicalUrl('https://www.dribbble.com/shots/123-x/?utm_source=a&page=2#top'), 'dribbble.com/shots/123-x?page=2');
  const brief = ['## Product', 'Landing…', `- 2026-10-27: ${rejectionLine('References – Home – Hero', 'B', 'https://www.awwwards.com/sites/terra', 'too "heavy" and dark')}`].join('\n');
  const r = rejectedInBrief(brief);
  assert.equal(r.get(canonicalUrl('https://awwwards.com/sites/terra/?utm_campaign=x')), "too 'heavy' and dark");
  assert.equal(r.size, 1);
  assert.equal(rejectedInBrief(null).size, 0);
});

test('behance covers resolve to the original size', () => {
  const embed = '<img src="https://mir-s3-cdn-cf.behance.net/projects/404_webp/abc.Y3Jv.jpg"><img src="https://mir-s3-cdn-cf.behance.net/projects/max_808/abc.Y3Jv.jpg">';
  assert.deepEqual(pageImages(embed, 'https://www.behance.net/embed/project/1', 4), ['https://mir-s3-cdn-cf.behance.net/projects/original/abc.Y3Jv.jpg']);
});

test('land-book and one page love give the full-page screenshot', () => {
  const lb = `<meta property="og:image" content="https://cdn.land-book.com/website/101415/101415-x-og-image.webp">
    <img src="https://cdn.land-book.com/image/400x0/filters:format(jpeg)/website/101415/mob-screenshot.jpg?signature=1">
    <img src="https://cdn.land-book.com/image/2000x0/filters:format(jpeg)/website/101415/desk-screenshot.jpg?signature=2">
    <img src="https://cdn.land-book.com/image/0x0:1366x2049/1200x0/website/42385/other-screenshot.webp?signature=3">`;
  assert.deepEqual(pageImages(lb, 'https://land-book.com/websites/101415-moreland', 4), ['https://cdn.land-book.com/website/101415/desk-screenshot.jpg', 'https://cdn.land-book.com/website/101415/mob-screenshot.jpg']);
  const opl = '<meta property="og:image" content="https://assets.onepagelove.com/cdn-cgi/image/width=1200,height=628,fit=cover,gravity=top,format=jpg,quality=85/wp-content/uploads/2026/01/opl-master-1.jpg">';
  assert.deepEqual(pageImages(opl, 'https://onepagelove.com/big-dirty-agency'), ['https://onepagelove.com/wp-content/uploads/2026/01/opl-master-1.jpg']);
});

test('planned sections come from the brief; coverage says which have a reference', () => {
  const brief = '## Product\nSections – Home: nav, hero (promise + CTA) → Services, process, testimonials\n- 2026-10-28: Sections – Pricing: plans, faq';
  const planned = plannedSections(brief);
  assert.deepEqual(planned.get('Home'), ['nav', 'hero', 'services', 'process', 'testimonials']);
  assert.deepEqual(planned.get('Pricing'), ['plans', 'faq']);
  assert.equal(sectionId('Home – Testimonials'), 'testimonials');
  const cov = coverage(planned, [
    { letter: 'B', board: 'References – Home – Hero', label: 'hero' },
    { letter: 'A', board: 'References – Home – Pages', label: 'services' },
    { letter: 'C', board: 'References – Home – Hero', label: 'process: steps', section: 'process', take: 'steps' },
  ]);
  assert.deepEqual(cov[0].covered.map((x) => x.section), ['hero', 'services']);
  assert.deepEqual(cov[0].borrowedOnly, ['process']);
  assert.deepEqual(cov[0].missing, ['nav', 'testimonials']);
  assert.match(coverageText(cov), /2\/5 have a reference[\s\S]*✗ no reference yet: nav, testimonials/);
  assert.equal(plannedSections('no sections here').size, 0);
});

test('planned components come from the brief; each needs a crop', () => {
  const planned = plannedComponents('## Product\nComponents: button (primary, outline), service card, Testimonial card, icons');
  assert.deepEqual(planned, ['button', 'service card', 'testimonial card', 'icons']);
  assert.equal(componentMatch('Cards/Service card', planned), 'service card');
  assert.equal(componentMatch('Badge', planned), undefined);
  const cov = componentCoverage(planned, [
    { letter: 'F', board: 'References – Home – Hero', label: 'component: button', section: 'component', take: 'button' },
    { letter: 'B', board: 'References – Home – Hero', label: 'hero: button', section: 'hero', take: 'button' },
  ]);
  assert.deepEqual(cov.covered, [{ component: 'button', from: 'F on References – Home – Hero' }]);
  assert.deepEqual(cov.missing, ['service card', 'testimonial card', 'icons']);
  assert.match(componentCoverageText(cov), /1\/4 have a crop[\s\S]*✗ no crop yet: service card, testimonial card, icons/);
});
