// Superadmin Workbench Entry Point
// Phase 6 Implementation - IDE Workbench Redesign

// Debug mode control - set to true to enable console logs for debugging
var VAPTGUARD_DEBUG = window.VAPTGUARD_DEBUG || false;

// Helper function for conditional logging
var vaptguardLog = window.vaptguardLog || {
  log: (...args) => VAPTGUARD_DEBUG && console.log('[VAPTGUARD]', ...args),
  warn: (...args) => VAPTGUARD_DEBUG && console.warn('[VAPTGUARD]', ...args),
  error: (...args) => console.error('[VAPTGUARD]', ...args), // Always show errors
  debug: (...args) => VAPTGUARD_DEBUG && console.debug('[VAPTGUARD]', ...args),
  info: (...args) => VAPTGUARD_DEBUG && console.info('[VAPTGUARD]', ...args)
};

(function () {
  vaptguardLog.log('workbench.js loaded');
  if (typeof wp === 'undefined') return;

  const { render, useState, useEffect, useMemo, Fragment, createElement: el } = wp.element || {};
  const { Button, ToggleControl, Spinner, Notice, Card, CardBody, CardHeader, CardFooter, Icon, Tooltip, Modal } = wp.components || {};
  const settings = window.vaptguardSettings || {};
  const isSuper = settings.isSuper || false;

  const apiFetch = wp.apiFetch;
  const { __, sprintf } = wp.i18n || {};

  // Settings moved to top

  const GeneratedInterface = window.VAPTGUARD_GeneratedInterface || window.vaptguard_GeneratedInterface;

  const STATUS_LABELS = {
    'All': __('All Lifecycle', 'vaptguard'),
    'Develop': __('Develop', 'vaptguard'),
    'Release': __('Release', 'vaptguard')
  };

  const ClientDashboard = () => {
    const [features, setFeatures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeStatus, setActiveStatus] = useState(() => {
      const saved = localStorage.getItem('vaptguard_workbench_active_status');
      return saved ? saved : 'Develop';
    });
    const [activeCategory, setActiveCategory] = useState('all');
    const [activeFeatureKey, setActiveFeatureKey] = useState(() => {
      const saved = localStorage.getItem('vaptguard_workbench_active_feature');
      return saved ? saved : null;
    });
    const [saveStatus, setSaveStatus] = useState(null);
    const [verifFeature, setVerifFeature] = useState(null);

    useEffect(() => {
      localStorage.setItem('vaptguard_workbench_active_status', activeStatus);
    }, [activeStatus]);

    useEffect(() => {
      if (activeFeatureKey) {
        localStorage.setItem('vaptguard_workbench_active_feature', activeFeatureKey);
      }
    }, [activeFeatureKey]);

    // Auto-dismiss Success Toasts
    useEffect(() => {
      if (saveStatus && saveStatus.type === 'success') {
        const timer = setTimeout(() => setSaveStatus(null), 1500);
        return () => clearTimeout(timer);
      }
    }, [saveStatus]);

    const fetchData = (refresh = false) => {
      setLoading(true);

      // Workbench always fetches all features (Superadmin-only, unscoped)
      const path = 'vaptguard/v1/features';
      apiFetch({ path })
        .then(data => {
          // Dedup features by key to prevent list inflation
          const uniqueFeatures = Array.from(new Map((data.features || []).map(item => [item.key, item])).values());
          setFeatures(uniqueFeatures);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message || 'Failed to load features');
          setLoading(false);
        });
    };

    useEffect(() => {
      fetchData();
    }, []);

    const updateFeature = (key, data, successMsg, silent = false) => {
      setFeatures(prev => prev.map(f => f.key === key ? { ...f, ...data } : f));
      if (!silent) {
        setSaveStatus({ message: __('Saving...', 'vaptguard'), type: 'info' });
      }

      return apiFetch({
        path: 'vaptguard/v1/features/update',
        method: 'POST',
        data: { key, ...data }
      })
        .then((res) => {
          if (!silent) {
            setSaveStatus({ message: successMsg || __('Saved', 'vaptguard'), type: 'success' });
          }
          return res;
        })
        .catch(err => {
          vaptguardLog.error('Save failed:', err);
          if (!silent) {
            setSaveStatus({ message: __('Save Failed', 'vaptguard'), type: 'error' });
          }
          throw err;
        });
    };

    const availableStatuses = useMemo(() => isSuper ? ['All', 'Draft', 'Develop', 'Test', 'Release'] : ['All', 'Draft', 'Develop', 'Test', 'Release'], [isSuper]);

    const statusFeatures = useMemo(() => {
        return features.filter(f => {
            // In generated builds (Locked Mode), we trust the list returned by the scoped API
            // which already filters by vaptguard_is_feature_allowed().
            // We still check for generated_schema to ensure the UI can render.
            if (!f.generated_schema) return false;

            const s = f.normalized_status || (f.status ? f.status.toLowerCase() : '');
            
            // For Locked Builds (Client Side), we typically want to see "Release" features.
            // However, the user might want to see what's implemented regardless of status 
            // if it's explicitly included in the build.
            const active = activeStatus.toLowerCase();

            if (active === 'all') {
                return true; // Trust the API's scoping
            }

            if (active === 'draft') return ['draft', 'available'].includes(s);
            if (active === 'develop') return ['develop', 'in_progress'].includes(s);
            if (active === 'test') return ['test', 'testing'].includes(s);
            if (active === 'release') return ['release', 'implemented'].includes(s);
            return s === active;
        });
    }, [features, activeStatus]);

    const categories = useMemo(() => {
      const cats = [...new Set(statusFeatures.map(f => f.category || 'Uncategorized'))].sort();
      return cats;
    }, [statusFeatures]);

    useEffect(() => {
      if (categories.length > 0) {
        if (!activeCategory || (activeCategory !== 'all' && !categories.includes(activeCategory))) {
          setActiveCategory('all');
        }
      } else {
        setActiveCategory(null);
      }
    }, [categories]);

    const displayFeatures = useMemo(() => {
      if (!activeCategory) return [];
      let list = [];
      if (activeCategory === 'all') list = statusFeatures;
      else list = statusFeatures.filter(f => (f.category || 'Uncategorized') === activeCategory);

      // If activeFeatureKey is not in the list, pick the first one
      if (list.length > 0) {
        const currentInList = list.find(f => f.key === activeFeatureKey);
        if (!currentInList) {
          setActiveFeatureKey(list[0].key);
        }
      } else {
        setActiveFeatureKey(null);
      }

      return list;
    }, [statusFeatures, activeCategory, activeFeatureKey]);

    const selectFeature = (featureKey, category) => {
      if (activeCategory !== category) {
        setActiveCategory(category);
      }
      setActiveFeatureKey(featureKey);
    };

    // Helper to render a single feature card
    const renderFeatureCard = (f, setVerifFeature) => {
      const schema = typeof f.generated_schema === 'string' ? JSON.parse(f.generated_schema) : (f.generated_schema || { controls: [] });
      vaptguardLog.log(`Rendering Feature ${f.key}:`, schema);
      const isVerifEngine = f.include_verification_engine;

      // 🛡️ Resilience: Auto-Inject Verification Controls (Moved from GeneratedInterface v3.6.19)
      // This ensures they are correctly filtered into 'automControls' and don't appear in 'implControls'
      if (schema && Array.isArray(schema.controls)) {
        const hasTests = schema.controls.some(c => c.type === 'test_action');
        const featureKey = f.key || '';

        if (!hasTests) {
          // 1. Rate Limiting / Brute Force
          if (['limit-login-attempts', 'rate-limiting', 'login-protection', 'xmlrpc-protection'].some(k => featureKey.includes(k))) {
            schema.controls.push({
              type: 'test_action',
              label: featureKey.includes('xmlrpc') ? 'Test: XML-RPC Block' : 'Test: Rate Limit (Spike)',
              key: 'auto_verify_resilience',
              test_logic: featureKey.includes('xmlrpc') ? 'block_xmlrpc' : 'spam_requests',
              help: __('Auto-injected verification test.', 'vaptguard')
            });
          }
          // 2. Generic Fallback
          else if (f.include_verification_engine || (f.generated_schema && f.generated_schema.include_verification_engine)) {
            schema.controls.push({
              type: 'test_action',
              label: 'Test: Basic Verification',
              key: 'auto_verify_generic',
              test_logic: 'default',
              help: __('Basic availability check.', 'vaptguard')
            });
          }
        }
      }

      // Filter controls
      // 1. Implementation Controls (Left Column)
      const implControls = schema.controls ? schema.controls.filter(c =>
        !['test_action', 'risk_indicators', 'assurance_badges', 'test_checklist', 'evidence_list', 'header', 'html', 'info', 'warning', 'alert'].includes(c.type) &&
        !['feat_enabled', 'is_enabled', 'is_enforced'].includes(c.key) &&
        !c.label?.toLowerCase().includes('notes') &&
        !c.label?.toLowerCase().includes('enable protection') &&
        !c.label?.toLowerCase().includes('enable feature')
      ) : [];

      // 1.1. Security Insights / HTML blocks for Row 1 Right Column
      const insightControls = schema.controls ? schema.controls.filter(c => (c.type === 'html' || c.type === 'info' || c.type === 'warning' || c.type === 'alert') && !c.label?.toLowerCase().includes('enable protection') && !c.label?.toLowerCase().includes('enable feature')) : [];

      // 1.2. Master Toggle Control (The one with the tooltip)
      const masterToggleControl = schema.controls ? schema.controls.find(c => c.type === 'toggle' && (c.key === 'feat_enabled' || c.label?.toLowerCase().includes('enable protection') || c.label?.toLowerCase().includes('enable feature'))) : null;

      // 2. Automated Controls (Right Column)
      const automControls = schema.controls ? schema.controls.filter(c => c.type === 'test_action') : [];
      const noteControls = (schema.controls || []).filter(c => {
        const isNote = c.label?.toLowerCase().includes('notes') || c.key?.includes('notes');
        if (!isNote) return false;

        // Content Check
        const implData = f.implementation_data ? (typeof f.implementation_data === 'string' ? JSON.parse(f.implementation_data) : f.implementation_data) : {};
        const val = implData[c.key];
        return val && val.toString().trim().length > 0;
      });

      return el(Card, { key: f.key, id: `feature-${f.key}`, style: { borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: 'none' } }, [
        el(CardHeader, { style: { borderBottom: '1px solid #f3f4f6', padding: '12px 24px' } }, [
          el('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '20px', width: '100%' } }, [
            el('div', null, [
              el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, [
                el('h3', { style: { margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center' } }, [
                  f.label,
                  f.severity && el('span', {
                    style: {
                      marginLeft: '15px',
                      fontSize: '11px',
                      fontWeight: '700',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      color: '#fff',
                      background: (() => {
                        const s = f.severity.toLowerCase();
                        if (s === 'critical') return '#dc2626'; // Red
                        if (s === 'high') return '#ea580c';     // Orange
                        if (s === 'medium') return '#2271b1';   // Blue
                        return '#64748b';                        // Slate (Low/Info)
                      })(),
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                    }
                  }, f.severity)
                ]),
                f.description && el('p', { style: { margin: 0, fontSize: '12px', color: '#64748b', lineHeight: '1.4' } }, f.description)
              ])
            ]),
            el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' } }, [
              el('span', {
                className: `vaptguard-status-badge status-${f.status.toLowerCase()}`,
                style: {
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                  color: '#fff',
                  background: (f.status === 'Develop' || f.status === 'develop') ? '#10b981' :
                    (f.status === 'Release' || f.status === 'release' || f.status === 'implemented') ? '#f97316' : '#94a3b8',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                }
              }, f.status),
            ])
          ])
        ]),
      el(CardBody, { style: { padding: '24px' } }, [
        el('div', { style: { display: 'flex', flexDirection: 'column', gap: '25px' } }, [
          // Row 1: Functional Implementation and Implementation Control
          el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', alignItems: 'stretch' } }, [
            // Left: Functional Implementation
            el('div', { className: 'vaptguard-implementation-panel', style: { padding: '15px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' } }, [
              el('h4', { style: { margin: '0 0 15px 0', fontSize: '13px', fontWeight: 700, color: '#111827', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', minHeight: '32px' } }, [
                el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                  el(Icon, { icon: 'admin-settings', size: 16 }),
                  __('Functional Implementation', 'vaptguard')
                ])
              ]),
              el('div', { style: { flex: 1, minWidth: 0, overflow: 'hidden' } }, [
                f.generated_schema && GeneratedInterface
                  ? el(GeneratedInterface, { 
                      feature: { ...f, generated_schema: { ...schema, controls: implControls } }, 
                      onUpdate: (data) => updateFeature(f.key, { implementation_data: data }), 
                      hideProtocol: true, // 🛡️ v3.14.14: Explicitly hide protocol from left panel
                      hideImplementationControl: true,
                      hideOpNotes: false, // Keep Business Impact here
                      hideThreatPanel: true // Prevent leaking Security Insights/HTML to left panel
                    })
                  : el('div', { style: { padding: '30px', background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: '8px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' } },
                    __('No configurable controls.', 'vaptguard'))
              ])
            ]),
            // Right: Implementation Control
            el('div', { className: 'vaptguard-control-panel', style: { padding: '15px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' } }, [
              el('h4', { style: { margin: '0 0 15px 0', fontSize: '13px', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', minHeight: '32px' } }, [
                el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                  el(Icon, { icon: 'shield', size: 16 }),
                  __('Implementation Control', 'vaptguard')
                ]),
                // 🛡️ Enable Protection Toggle next to title
                masterToggleControl ? el('div', { className: 'vaptguard-inline-master-toggle', style: { transform: 'scale(0.85)', marginRight: '-10px', display: 'flex', alignItems: 'center' } }, [
                  el(GeneratedInterface, {
                    feature: { ...f, generated_schema: { ...schema, controls: [masterToggleControl] } },
                    onUpdate: (data) => updateFeature(f.key, { implementation_data: data }),
                    hideOpNotes: true,
                    hideProtocol: true,
                    hideMonitor: true,
                    globalProtection: true,
                    isCompact: false // Restored label
                  })
                ]) : el('div', { className: 'vaptguard-inline-master-toggle', style: { transform: 'scale(0.85)', marginRight: '-10px', display: 'flex', alignItems: 'center' } }, [
                  el(ToggleControl, {
                    label: __('Enable Protection', 'vaptguard'),
                    checked: !!(f.is_enabled || f.is_enforced),
                    onChange: (val) => updateFeature(f.key, { is_enabled: val ? 1 : 0, is_enforced: val ? 1 : 0 }, __('Saved', 'vaptguard')),
                    __nextHasNoMarginBottom: true
                  })
                ])
              ]),
              el('div', { style: { padding: '10px 0' } }, [
                // Render Security Insights / HTML controls
                insightControls.length > 0 && el(GeneratedInterface, {
                  feature: { ...f, generated_schema: { ...schema, controls: insightControls } },
                  onUpdate: (data) => updateFeature(f.key, { implementation_data: data }),
                  hideOpNotes: true,
                  hideProtocol: true,
                  hideMonitor: true
                })
              ])
            ])
          ]),

          // Row 2: Manual Verification Protocol and Automated Verification Engine
          el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' } }, [
            // Left: Manual Verification Protocol
            el('div', { className: 'vaptguard-protocol-panel', style: { padding: '15px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' } }, [
              el('div', { style: { flex: 1, minWidth: 0, overflow: 'hidden' } }, [
                // v3.14.11: CLEANEST RENDERING - only show protocol box
                el(GeneratedInterface, {
                  // 🛡️ v3.14.12: Pass a schema with ZERO controls to ensure NO toggles/inputs leak in
                  feature: { ...f, generated_schema: { ...schema, controls: [] } }, 
                  onUpdate: (data) => updateFeature(f.key, { implementation_data: data }),
                  hideOpNotes: true,             
                  hideMonitor: true,             
                  hideImplementationControl: true, 
                  hideThreatPanel: true,          
                  hideBadges: true,               
                  hideProtocol: false             
                })
              ])
            ]),
            // Right: Automated Verification Engine
            el('div', { className: 'vaptguard-automation-panel', style: { padding: '15px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' } }, [
              el('h4', { style: { margin: '0 0 12px 0', fontSize: '11px', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' } }, [
                el(Icon, { icon: 'yes-alt', size: 14 }),
                __('Automated Verification Engine', 'vaptguard')
              ]),
              el('div', { style: { flex: 1, minWidth: 0, overflow: 'hidden' } }, [
                automControls.length > 0 ? el(GeneratedInterface, {
                  feature: { ...f, generated_schema: { ...schema, controls: automControls } },
                  onUpdate: (data) => updateFeature(f.key, { implementation_data: data }),
                  hideMonitor: true,
                  hideOpNotes: true, // Hide Business Impact here
                  hideProtocol: true, // Manual protocol is in its own panel
                  showTechnicalTrace: true,
                  showVerificationDetails: false
                }) : el('p', { style: { fontSize: '12px', color: '#64748b', fontStyle: 'italic', margin: 0 } }, __('No automated tests defined.', 'vaptguard'))
              ])
            ])
          ])
        ]),

          // Operational Notes (Full Width, Below Grid)
          !!f.include_operational_notes && noteControls.length > 0 && el('div', { style: { marginTop: '25px', padding: '15px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' } }, [
            el('h4', { style: { margin: '0 0 10px 0', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' } }, [
              el(Icon, { icon: 'editor-help', size: 18 }),
              __('Operational Notes', 'vaptguard')
            ]),
            el(GeneratedInterface, {
              feature: { ...f, generated_schema: { ...schema, controls: noteControls } },
              onUpdate: (data) => updateFeature(f.key, { implementation_data: data }),
              hideMonitor: true
            })
          ])
        ]),
        el(CardFooter, { style: { borderTop: '1px solid #f3f4f6', padding: '12px 24px', background: '#fafafa' } }, [
          el('span', { style: { fontSize: '11px', color: '#9ca3af' } }, sprintf(__('Feature Reference: %s', 'vaptguard'), f.key))
        ])
      ]);
    };

    if (loading) return el('div', { className: 'vaptguard-loading' }, [el(Spinner), el('p', null, __('Loading Workbench...', 'vaptguard'))]);
    if (error) return el(Notice, { status: 'error', isDismissible: false }, error);

    return el('div', { className: 'vaptguard-workbench-root', style: { display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)', background: '#f9fafb', position: 'relative', paddingBottom: '40px' } }, [

      // Toast Notification
      saveStatus && el('div', {
        style: {
          position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: saveStatus.type === 'error' ? '#fde8e8' : (saveStatus.type === 'success' ? '#def7ec' : '#e0f2fe'),
          color: saveStatus.type === 'error' ? '#9b1c1c' : (saveStatus.type === 'success' ? '#03543f' : '#0369a1'),
          padding: '8px 16px', borderRadius: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          zIndex: 9999, fontWeight: '600', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px',
          border: '1px solid rgba(0,0,0,0.05)'
        }
      }, [
        el(Icon, { icon: saveStatus.type === 'error' ? 'warning' : (saveStatus.type === 'success' ? 'yes' : 'update'), size: 16 }),
        saveStatus.message
      ]),

      // Top Navigation
      el('header', { style: { padding: '15px 30px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '15px' } }, [
          el('h2', { style: { margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'baseline', gap: '8px' } }, [
            __('VAPT Implementation Dashboard'),
            el('span', { style: { fontSize: '11px', color: '#9ca3af', fontWeight: '400' } }, `v${settings.pluginVersion}`)
          ])
        ]),
        el('div', { style: { display: 'flex', gap: '5px', background: '#f3f4f6', padding: '4px', borderRadius: '8px' } },
          availableStatuses.map(s => el(Button, {
            key: s,
            onClick: () => setActiveStatus(s),
            style: {
              background: activeStatus === s ? '#fff' : 'transparent',
              color: activeStatus === s ? '#111827' : '#6b7280',
              border: 'none', borderRadius: '6px', padding: '8px 16px', fontWeight: 600, fontSize: '13px',
              boxShadow: activeStatus === s ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }
          }, STATUS_LABELS[s]))
        )
      ]),

      // Main Content Area
      el('div', { style: { display: 'flex', flexGrow: 1, overflow: 'hidden' } }, [
        // Pane 1: Categories Sidebar (Left)
        el('aside', { className: 'vaptguard-workbench-sidebar', style: { width: '240px', borderRight: '1px solid #e5e7eb', background: '#fff', overflowY: 'auto', padding: '20px 0', flexShrink: 0 } }, [
          el('div', { style: { padding: '0 20px 10px', fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' } }, __('Feature Categories')),
          categories.length > 0 && el(Fragment, null, [
            el('button', {
              onClick: () => setActiveCategory('all'),
              className: 'vaptguard-sidebar-link' + (activeCategory === 'all' ? ' is-active' : ''),
              style: {
                width: '100%', border: 'none', background: activeCategory === 'all' ? '#eff6ff' : 'transparent',
                color: activeCategory === 'all' ? '#1d4ed8' : '#4b5563',
                padding: '12px 20px', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                borderRight: activeCategory === 'all' ? '3px solid #1d4ed8' : 'none', fontWeight: activeCategory === 'all' ? 600 : 500,
                fontSize: '14px'
              }
            }, [
              el('span', null, __('All Categories', 'vaptguard')),
              el('span', { style: { fontSize: '11px', background: activeCategory === 'all' ? '#dbeafe' : '#f3f4f6', padding: '2px 6px', borderRadius: '4px' } }, statusFeatures.length)
            ]),
            categories.map(cat => {
              const catFeatures = statusFeatures.filter(f => (f.category || 'Uncategorized') === cat);
              const isActive = activeCategory === cat;
              return el('button', {
                key: cat,
                onClick: () => setActiveCategory(cat),
                className: 'vaptguard-sidebar-link' + (isActive ? ' is-active' : ''),
                style: {
                  width: '100%', border: 'none', background: isActive ? '#eff6ff' : 'transparent',
                  color: isActive ? '#1d4ed8' : '#4b5563',
                  padding: '12px 20px', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                  borderRight: isActive ? '3px solid #1d4ed8' : 'none', fontWeight: isActive ? 600 : 500,
                  fontSize: '14px'
                }
              }, [
                el('span', null, cat),
                el('span', { style: { fontSize: '11px', background: isActive ? '#dbeafe' : '#f3f4f6', padding: '2px 6px', borderRadius: '4px' } }, catFeatures.length)
              ]);
            })
          ]),
          categories.length === 0 && el('p', { style: { padding: '20px', color: '#9ca3af', fontSize: '13px' } }, __('No active categories', 'vaptguard'))
        ]),

        // Pane 2: Feature List (Middle)
        el('div', { className: 'vaptguard-workbench-list', style: { width: '320px', borderRight: '1px solid #e5e7eb', background: '#fcfcfd', overflowY: 'auto', flexShrink: 0 } }, [
          el('div', { style: { padding: '20px', fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', borderBottom: '1px solid #f3f4f6' } },
            activeCategory === 'all' ? __('All Features', 'vaptguard') : sprintf(__('%s Features', 'vaptguard'), activeCategory)
          ),
          displayFeatures.length === 0 ? el('p', { style: { padding: '20px', color: '#9ca3af', fontSize: '13px' } }, __('No features available', 'vaptguard')) :
            displayFeatures.map(f => {
              const isActive = activeFeatureKey === f.key;
              const multiFileClass = f.exists_in_multiple_files ? ' vaptguard-feature-multi-file' : (f.is_from_active_file === false ? ' vaptguard-feature-inactive-only' : '');
              return el('button', {
                key: f.key,
                onClick: () => setActiveFeatureKey(f.key),
                className: 'vaptguard-feature-item' + (isActive ? ' is-active' : '') + multiFileClass,
                style: {
                  width: '100%', border: 'none', borderBottom: '1px solid #f3f4f6',
                  background: isActive ? '#eff6ff' : 'transparent',
                  color: isActive ? '#1d4ed8' : '#4b5563',
                  padding: '12px 20px', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderRight: isActive ? '3px solid #1d4ed8' : 'none',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '14px',
                  transition: 'all 0.15s ease'
                }
              }, [
                el('span', null, f.label)
              ]);
            })
        ]),

        // Pane 3: Feature Interface (Right)
        el('main', { style: { flexGrow: 1, padding: '30px', overflowY: 'auto', background: '#f9fafb' } }, [
          !activeFeatureKey ? el('div', { style: { textAlign: 'center', padding: '100px', color: '#9ca3af' } }, __('Select a feature from the list to view implementation controls.', 'vaptguard')) :
            el('div', { style: { maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 } }, [
              // Breadcrumb Removed (v3.6.19 Request)
              renderFeatureCard(features.find(f => f.key === activeFeatureKey), setVerifFeature)
            ])
        ])
      ]),

      // Functional Verification Modal (Simplified)
      verifFeature && el(Modal, {
        title: sprintf(__('Manual Verification: %s', 'vaptguard'), verifFeature.label),
        onRequestClose: () => setVerifFeature(null),
        style: { width: '700px', maxWidth: '98%' }
      }, (() => {
        const f = verifFeature;
        const schema = typeof f.generated_schema === 'string' ? JSON.parse(f.generated_schema) : (f.generated_schema || { controls: [] });

        // Extracted Manual Steps Only
        const protocol = f.test_method || '';
        const checklist = typeof f.verification_steps === 'string' ? JSON.parse(f.verification_steps) : (f.verification_steps || []);
        const guideItems = schema.controls ? schema.controls.filter(c => ['test_checklist', 'evidence_list'].includes(c.type)) : [];
        const support = schema.controls ? schema.controls.filter(c => ['risk_indicators', 'assurance_badges'].includes(c.type)) : [];

        const boxStyle = { padding: '15px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' };

        return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px', padding: '10px' } }, [
          // Manual Protocol & Evidence
          (protocol || checklist.length > 0 || guideItems.length > 0) ? el('div', { style: { ...boxStyle, background: '#f8fafc' } }, [
            el('h4', { style: { margin: '0 0 15px 0', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' } }, __('Manual Verification Protocol', 'vaptguard')),

            protocol && el('div', { style: { marginBottom: '20px' } }, [
              el('label', { style: { display: 'block', fontSize: '11px', fontWeight: 700, color: '#92400e', marginBottom: '8px', textTransform: 'uppercase' } }, __('Test Protocol')),
              el('ol', { style: { margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#4b5563', lineHeight: '1.6' } },
                protocol.split('\n').filter(l => l.trim()).map((l, i) => el('li', { key: i, style: { marginBottom: '4px' } }, l.replace(/^\d+\.\s*/, '')))
              )
            ]),

            checklist.length > 0 && el('div', { style: { marginBottom: '20px' } }, [
              el('label', { style: { display: 'block', fontSize: '11px', fontWeight: 700, color: '#0369a1', marginBottom: '8px', textTransform: 'uppercase' } }, __('Evidence Checklist')),
              el('ol', { style: { margin: 0, padding: 0, listStyle: 'none' } },
                checklist.map((step, i) => el('li', { key: i, style: { fontSize: '12px', color: '#4b5563', display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' } }, [
                  el('input', { type: 'checkbox', style: { margin: '3px 0 0 0', width: '14px', height: '14px' } }),
                  el('span', null, step)
                ]))
              )
            ]),

            guideItems.length > 0 && el(GeneratedInterface, {
              feature: { ...f, generated_schema: { ...schema, controls: guideItems } },
              onUpdate: (data) => updateFeature(f.key, { implementation_data: data }),
              isGuidePanel: true
            })
          ]) : el('div', { style: { padding: '20px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' } }, __('No manual verification steps defined.', 'vaptguard')),

          // Assurance Badges
          support.length > 0 && el('div', { style: { ...boxStyle, background: '#f0fdf4', border: '1px solid #bbf7d0' } }, [
            el('h4', { style: { margin: '0 0 12px 0', fontSize: '12px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' } }, __('Verification & Assurance')),
            el(GeneratedInterface, { feature: { ...f, generated_schema: { ...schema, controls: support } }, onUpdate: (data) => updateFeature(f.key, { implementation_data: data }) })
          ])
        ]);
      })())
    ]);
  };

  // Robust DOM-ready: handles 'loading', 'interactive', and 'complete' states
  const init = () => {
    const container = document.getElementById('vaptguard-workbench-root');
    if (container) render(el(ClientDashboard), container);
    else vaptguardLog.error('#vaptguard-workbench-root not found!');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // readyState is 'interactive' or 'complete' — DOM is already ready
    init();
  }
})();
