# Phase 4: MVP Launch Test Plan

## Testing Scope
- **Timeline**: Day 4-5 (Thursday-Friday) before Friday deadline
- **Devices**: Desktop, tablet, mobile
- **Browsers**: Chrome, Firefox, Safari, Edge
- **Focus**: User-facing features (Free Review, Dashboard, Widgets)

## 1. Free Review Page Testing

### Functionality Tests
- ✅ Code input field accepts pasted code (max 6KB)
- ✅ GitHub URL input accepts valid GitHub URLs
- ✅ "Scan Now" button triggers analysis
- ✅ Loading state shows "🔍 Analyzing..." message
- ✅ Skeleton loader animates while scanning
- ✅ Results display with all 4 score meters
- ✅ Verdict section shows decision + CTA
- ✅ "Retry" button appears on error
- ✅ Error state clear and actionable

### UX Tests
- ✅ Loading message provides reassurance
- ✅ Skeleton loaders feel natural (not jarring)
- ✅ Score meters display correctly (0-100 scale)
- ✅ Finding cards show all severity levels
- ✅ "Generate Buyer Report" button is clickable
- ✅ Links work correctly to paid flow

### Responsive Tests
- ✅ Mobile (375px): 1 column layout
- ✅ Tablet (768px): 2 column layout
- ✅ Desktop (1024px): Full layout
- ✅ Input fields are touch-friendly
- ✅ Buttons have adequate tap targets (44px+ height)

### Edge Cases
- [ ] Empty code input shows error message
- [ ] Invalid GitHub URL shows error message
- [ ] Network error shows retry button
- [ ] Slow network (3G) shows loading state properly
- [ ] Multiple rapid scans don't queue incorrectly
- [ ] Page scroll position maintained on results

### Accessibility Tests
- ✅ All buttons have proper focus states (outline)
- ✅ Color contrast meets WCAG AA (4.5:1)
- ✅ Form labels are associated with inputs
- ✅ Loading spinners are announced
- ✅ Error messages are prominent
- [ ] Screen reader reads all text correctly
- [ ] Keyboard navigation works (Tab/Shift+Tab)
- [ ] Skip to main content link present

## 2. Dashboard Page Testing

### Functionality Tests
- ✅ Metrics display correctly (count, verified, avg trust)
- ✅ Quick action buttons all link correctly
  - [ ] "New Scan" → /free-review
  - [ ] "Generate App" → /dashboard
  - [ ] "View Projects" → /projects
  - [ ] "Get Certificate" → /certificate
- ✅ Action cards (Projects, Reports, Certificates) display
- ✅ Project list shows latest items
- ✅ Trust score badges display with correct colors
- ✅ BillingWidget shows plan, usage, renewal date
- ✅ ActivityFeed shows recent jobs (or empty state)
- ✅ IntegrationStatus shows GitHub/Google status

### Widget Tests - BillingWidget
- [ ] Plan tier displays correctly (Free/Pro/Enterprise)
- [ ] Usage progress bar animates smoothly
- [ ] Usage near limit (80%+) shows warning
- [ ] "Upgrade Plan" button links to /pricing
- [ ] "Manage" button links to /account/billing
- [ ] Renewal date formats correctly (MM/DD/YYYY)

### Widget Tests - ActivityFeed
- [ ] Recent jobs display with correct icons
- [ ] Timestamps show relative time (e.g., "2h ago")
- [ ] Status badges show correct colors
- [ ] Activity items link to projects
- [ ] Empty state shows helpful message
- [ ] Max 10 items displayed

### Widget Tests - IntegrationStatus
- [ ] GitHub status shows connected/not-connected
- [ ] Google status shows connected/not-connected
- [ ] "Connect" buttons are clickable when not connected
- [ ] "Connected" badge shows when integrated
- [ ] Integration icons display correctly

### Responsive Tests
- ✅ Mobile (375px): Stacked layout
- ✅ Tablet (768px): 2-column layout
- ✅ Desktop (1024px): Full 3-column layout
- ✅ Quick actions wrap correctly on mobile
- ✅ Widgets stack vertically on small screens

### Hover State Tests
- ✅ Quick action buttons lift on hover
- ✅ Project cards lift on hover with shadow
- ✅ ActionCards lift and brighten border
- ✅ Activity items respond to hover
- ✅ All transitions are smooth (300ms)

## 3. Component Compatibility Tests

### Button Component
- ✅ All variants work: default, outline, secondary, ghost, destructive
- ✅ All sizes work: sm, lg, icon, default
- ✅ Hover states apply correctly
- ✅ Disabled state removes hover effects
- ✅ Focus states are visible

### Badge Component
- ✅ All variants display: ready, risky, blocked, muted, outline
- ✅ Text renders correctly
- ✅ Sizing is consistent

### Card Components
- ✅ Panels render with correct styling
- ✅ Cells render with border and shadow
- ✅ Spacing is consistent

## 4. Cross-Browser Testing

### Chrome/Edge (Latest)
- [ ] Free Review loads correctly
- [ ] Dashboard renders all widgets
- [ ] Hover effects work smoothly
- [ ] No console errors

### Firefox (Latest)
- [ ] Free Review loads correctly
- [ ] Dashboard renders all widgets
- [ ] Hover effects work smoothly
- [ ] No console errors

### Safari (Latest)
- [ ] Free Review loads correctly
- [ ] Dashboard renders all widgets
- [ ] Hover effects work smoothly
- [ ] No console errors

### Mobile Safari (iOS)
- [ ] Responsive layout adapts
- [ ] Touch events work (no hover on mobile)
- [ ] Buttons are tappable

## 5. Performance Tests

### Core Web Vitals
- [ ] LCP (Largest Contentful Paint): < 2.5s
- [ ] FID (First Input Delay): < 100ms
- [ ] CLS (Cumulative Layout Shift): < 0.1

### Load Times
- [ ] Dashboard loads in < 2s (first paint)
- [ ] Free Review page loads in < 2s
- [ ] API response within 5s for analysis

### Visual Rendering
- [ ] No FOUC (Flash of Unstyled Content)
- [ ] No layout jank during transitions
- [ ] Skeleton loaders show immediately

## 6. Data & Integration Tests

### API Integration
- ✅ Free Review API endpoint (/api/public-demo-scan) works
- ✅ GEMINI_API_KEY is configured
- ✅ Error handling works on API failure
- ✅ Rate limiting doesn't affect MVP users

### Stripe Integration (if billing active)
- [ ] "Upgrade Plan" leads to Stripe checkout
- [ ] Payment processing works
- [ ] Success redirects correctly

## 7. Edge Cases & Error Handling

### Network Issues
- [ ] Slow network doesn't break UI
- [ ] Timeout errors show retry option
- [ ] Offline detection works

### User Input Validation
- [ ] Empty code input rejected
- [ ] Oversized code rejected with message
- [ ] Invalid URLs rejected

### State Management
- [ ] Refreshing page doesn't lose state
- [ ] Back button works correctly
- [ ] Multiple tabs don't interfere

## 8. Security Tests

### XSS Protection
- [ ] User input sanitized (code input)
- [ ] No eval() or dangerous functions
- [ ] Content Security Policy headers set

### CSRF Protection
- [ ] API endpoints validate origin
- [ ] Forms use CSRF tokens

### Data Privacy
- [ ] No sensitive data logged to console
- [ ] API responses don't contain PII
- [ ] Rate limiting protects abuse

## 9. Accessibility Tests (WCAG 2.1 Level AA)

### Keyboard Navigation
- [ ] Tab order is logical
- [ ] Focus indicators visible
- [ ] No keyboard traps

### Screen Reader
- [ ] Page title announced
- [ ] Navigation structure clear
- [ ] Form labels associated
- [ ] Buttons have accessible names
- [ ] Loading states announced

### Color & Contrast
- [ ] Text contrast 4.5:1 (AAA)
- [ ] No information conveyed by color alone
- [ ] Error messages don't rely on red alone

### Responsive & Zoom
- [ ] Page works at 200% zoom
- [ ] Text is readable without horizontal scroll
- [ ] Touch targets 44x44 minimum

## 10. Launch Readiness Checklist

### Code Quality
- [ ] No console errors on free-review
- [ ] No console errors on dashboard
- [ ] No console errors on any page
- [ ] ESLint passes (or only non-critical warnings)

### Documentation
- [ ] HOVER_STATES_GUIDE.md created
- [ ] Component props documented
- [ ] API endpoints documented

### Performance
- [ ] Images optimized
- [ ] CSS critical path optimized
- [ ] JavaScript bundled efficiently

### Business Requirements
- [ ] Free Review UX complete and polished
- [ ] Dashboard shows all required widgets
- [ ] Hover states enhance interactivity
- [ ] Mobile experience is smooth
- [ ] Error states are clear

## Testing Schedule

### Day 4 (Thursday)
- 9:00-11:00: Functionality testing (Free Review + Dashboard)
- 11:00-13:00: Responsive & cross-browser testing
- 13:00-15:00: Accessibility & edge case testing
- 15:00-17:00: Performance & load testing
- 17:00-18:00: Final verification & bug fixes

### Day 5 (Friday)
- 9:00-10:00: Final smoke test
- 10:00-11:00: Edge case verification
- 11:00-12:00: Cross-browser final check
- 12:00-13:00: Launch preparation & deployment
- 13:00+: Live on production ✅

## Test Results Template

```
Component: [Name]
Page: [URL]
Device: [Desktop/Mobile/Tablet]
Browser: [Chrome/Firefox/Safari/Edge]
OS: [Windows/Mac/iOS/Android]

Test Case: [Description]
Status: [PASS/FAIL/PENDING]
Notes: [Any issues or observations]
```

## Known Issues & Workarounds

### Issue 1: Inline Style in BillingWidget
- **Location**: components/billing-widget.tsx line 75
- **Impact**: Linter warning only, not functional issue
- **Workaround**: CSS is dynamic based on usage %, requires inline style
- **Status**: Acceptable for MVP

### Issue 2: Markdown Formatting
- **Location**: HOVER_STATES_GUIDE.md
- **Impact**: Linter warnings, content is valid
- **Workaround**: Can be fixed post-launch
- **Status**: Acceptable for MVP

## Sign-Off

- [ ] All critical tests pass (P0)
- [ ] All important tests pass (P1)
- [ ] No blocking bugs
- [ ] Ready for launch
- [ ] Signed off by QA: ___________
- [ ] Approved for production: ___________
