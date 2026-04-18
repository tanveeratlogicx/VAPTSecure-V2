// Client Dashboard Entry Point
// Phase 6 Implementation - IDE Workbench Redesign

// Debug mode control - set to true to enable console logs for debugging
var VAPT_DEBUG = window.VAPT_DEBUG || false;

// Helper function for conditional logging
var vaptLog = window.vaptLog || {
  log: (...args) => VAPT_DEBUG && console.log('[VAPTGuard]', ...args),
  warn: (...args) => VAPT_DEBUG && console.warn('[VAPTGuard]', ...args),
  error: (...args) => console.error('[VAPTGuard]', ...args), // Always show errors
  debug: (...args) => VAPT_DEBUG && console.debug('[VAPTGuard]', ...args),
  info: (...args) => VAPT_DEBUG && console.info('[VAPTGuard]', ...args)
};

(function () {
  vaptLog.log('client.js loaded');
  if (typeof wp === 'undefined') return;

  const { render, useState, useEffect, useMemo, useRef, Fragment, createElement: el } = wp.element || {};
  const { Button, ToggleControl, Spinner, Notice, Card, CardBody, CardHeader, CardFooter, Icon, Tooltip, Modal } = wp.components || {};
  const settings = window.vaptguardSettings || {};
  const apiFetch = wp.apiFetch;
  const { __, sprintf } = wp.i18n || {};

  const GeneratedInterface = window.vaptguard_GeneratedInterface || window.vapt_GeneratedInterface;

  const ClientDashboard = () => {
    const [features, setFeatures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const domain = settings.currentDomain || window.location.hostname;
    const [activeTab, setActiveTab] = useState('all'); // 'all', 'stats', or severity level
    const [saveStatus, setSaveStatus] = useState(null);
    const [enforceStatusMap, setEnforceStatusMap] = useState({});
    const [verifFeature, setVerifFeature] = useState(null);
    const [globalProtection, setGlobalProtection] = useState(true);
    const [globalSaving, setGlobalSaving] = useState(false);

    const [securityStats, setSecurityStats] = useState({
      total_blocks: 0,
      blocks_24h: 0,
      top_risk: 'None',
      active_enforcements: 0
    });
    const [securityLogs, setSecurityLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const consecutiveFailsRef = useRef(0);

    // Fetch Data
    const fetchData = (refresh = false) => {
      if (refresh) setIsRefreshing(true);
      else setLoading(true);

      const path = `vaptguard/v1/features?scope=client&domain=${encodeURIComponent(domain)}`;
      apiFetch({ path })
        .then(data => {
          const uniqueFeatures = Array.from(new Map((data.features || []).map(item => [item.key, item])).values());
          setFeatures(uniqueFeatures);
          setLoading(false);
          setIsRefreshing(false);
        })
        .catch(err => {
          setError(err.message || 'Failed to load features');
          setLoading(false);
          setIsRefreshing(false);
        });
    };

    const fetchSecurityInsights = () => {
      if (consecutiveFailsRef.current >= 3) {
        return false; // Signal to stop polling
      }

      // Fetch Stats
      apiFetch({ path: 'vaptguard/v1/security/stats' })
        .then(data => {
          setSecurityStats(data);
          consecutiveFailsRef.current = 0;
        })
        .catch(err => {
          vaptLog.error('Failed to fetch security stats:', err);
          consecutiveFailsRef.current++;
        });

      // Fetch Logs
      setLogsLoading(true);
      apiFetch({ path: 'vaptguard/v1/security/logs?limit=10' })
        .then(data => {
          setSecurityLogs(data || []);
          setLogsLoading(false);
        })
        .catch(err => {
          vaptLog.error('Failed to fetch security logs:', err);
          setLogsLoading(false);
          consecutiveFailsRef.current++;
        });

      return true;
    };

    const fetchGlobalSettings = () => {
      apiFetch({ path: 'vaptguard/v1/settings/enforcement' })
        .then(data => setGlobalProtection(data.enabled))
        .catch(err => vaptLog.error('Failed to fetch global settings:', err));
    };

    useEffect(() => {
      fetchData();
      fetchSecurityInsights();
      fetchGlobalSettings();

      // Real-time Polling: 30 seconds
      const interval = setInterval(() => {
        const keepPolling = fetchSecurityInsights();
        if (!keepPolling) {
          vaptLog.warn('Background polling stopped due to consecutive network/REST errors.');
          clearInterval(interval);
        }
      }, 30000);

      return () => clearInterval(interval);
    }, []);

    const updateFeature = (key, data, successMsg, silent = false) => {
      setFeatures(prev => prev.map(f => f.key === key ? { ...f, ...data } : f));
      if (!silent) setSaveStatus({ message: __('Saving...', 'vaptguard'), type: 'info' });

      return apiFetch({
        path: 'vaptguard/v1/features/update',
        method: 'POST',
        data: { key, ...data }
      })
        .then((res) => {
          if (!silent) setSaveStatus({ message: successMsg || __('Saved', 'vaptguard'), type: 'success' });
          return res;
        })
        .catch(err => {
          if (!silent) setSaveStatus({ message: __('Save Failed', 'vaptguard'), type: 'error' });
          throw err;
        });
    };

    // Filtered Features
    const releasedFeatures = useMemo(() => {
      return features.filter(f => {
        // In generated builds (Locked Mode), we trust the list returned by the scoped API
        if (settings.domainLocked || !f.status) return true;

        const s = f.normalized_status || (f.status ? f.status.toLowerCase() : '');
        return ['release', 'implemented'].includes(s);
      });
    }, [features, settings.domainLocked]);

    const filteredFeatures = useMemo(() => {
      if (activeTab === 'all' || activeTab === 'stats') return releasedFeatures;
      return releasedFeatures.filter(f => (f.severity || '').toLowerCase() === activeTab);
    }, [releasedFeatures, activeTab]);

    const severityConfigs = useMemo(() => {
      const counts = { all: releasedFeatures.length };
      const severities = [];

      releasedFeatures.forEach(f => {
        const s = (f.severity || 'low').toLowerCase();
        if (!counts[s]) {
          counts[s] = 0;
          severities.push(s);
        }
        counts[s]++;
      });

      const configMap = {
        critical: { label: __('Critical Severity', 'vaptguard'), icon: 'warning', color: '#dc2626' },
        high: { label: __('High Severity', 'vaptguard'), icon: 'warning', color: '#ea580c' },
        medium: { label: __('Medium Severity', 'vaptguard'), icon: 'flag', color: '#2271b1' },
        low: { label: __('Low Severity', 'vaptguard'), icon: 'yes-alt', color: '#64748b' }
      };

      const items = [{ id: 'all', label: __('All Severity Levels', 'vaptguard'), icon: 'shield', count: counts.all }];

      // Add existing severities dynamically
      ['critical', 'high', 'medium', 'low'].forEach(key => {
        if (counts[key] > 0) {
          items.push({ id: key, ...configMap[key], count: counts[key] });
        }
      });

      return items;
    }, [releasedFeatures]);

    // Stats Dashboard Component
    const StatsDashboard = () => {
      const stats = [
        { label: __('Total Protection Rules', 'vaptguard'), value: releasedFeatures.length, icon: 'shield-alt', color: '#2271b1' },
        { label: __('Active Enforcements', 'vaptguard'), value: securityStats.active_enforcements, icon: 'yes', color: '#10b981' },
        { label: __('Security Events (Total)', 'vaptguard'), value: securityStats.total_blocks, icon: 'visibility', color: '#f59e0b' },
        { label: __('Risk Blocked (24h)', 'vaptguard'), value: securityStats.blocks_24h, icon: 'warning', color: '#dc2626' }
      ];

      return el('div', { className: 'vapt-stats-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '25px', marginBottom: '35px' } },
        stats.map((s, idx) => el('div', {
          key: idx,
          className: 'vapt-stat-card premium',
          style: {
            background: 'white',
            padding: '25px',
            borderRadius: '16px',
            border: '1px solid #f1f5f9',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)'
          }
        }, [
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' } }, [
            el('div', { style: { padding: '8px', background: `${s.color}10`, borderRadius: '10px' } },
              el(Icon, { icon: s.icon, size: 20, style: { color: s.color } })
            ),
            el('span', { style: { fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' } }, s.label)
          ]),
          el('div', { style: { fontSize: '28px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.025em' } }, s.value)
        ]))
      );
    };

    const LiveSecurityLogs = () => {
      return el('div', { className: 'vapt-log-card premium', style: { background: 'white', borderRadius: '16px', border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' } }, [
        el('div', { style: { padding: '20px 25px', borderBottom: '1px solid #f1f5f9', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
          el('h3', { style: { margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' } }, [
            el(Icon, { icon: 'list-view', size: 18, style: { color: '#64748b' } }),
            __('Live Security Monitoring', 'vaptguard')
          ]),
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '15px' } }, [
            logsLoading && el(Spinner, { size: 16 }),
            el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#10b981', fontWeight: 700, background: '#f0fdf4', padding: '4px 12px', borderRadius: '20px' } }, [
              el('span', { className: 'pulse-dot', style: { width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.2)' } }),
              __('Live', 'vaptguard')
            ])
          ])
        ]),
        el('div', { style: { overflowX: 'auto' } }, [
          el('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: '600px' } }, [
            el('thead', null, el('tr', null, [
              [__('Time'), __('Risk ID'), __('Event'), __('Source IP'), __('Status')].map(h => el('th', { key: h, style: { textAlign: 'left', padding: '15px 25px', fontSize: '11px', fontWeight: 800, color: '#64748b', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' } }, h))
            ])),
            el('tbody', null, securityLogs.length === 0 ? el('tr', null, el('td', { colSpan: 5, style: { padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px', fontStyle: 'italic' } }, __('No security events detected yet.', 'vaptguard'))) :
              securityLogs.map((log, i) => {
                const details = JSON.parse(log.details || '{}');
                return el('tr', { key: log.id, style: { borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' } }, [
                  el('td', { style: { padding: '15px 25px', fontSize: '13px', color: '#64748b', fontWeight: 500 } }, log.created_at),
                  el('td', { style: { padding: '15px 25px', fontSize: '13px', fontWeight: 700, color: '#0f172a' } }, log.feature_key),
                  el('td', { style: { padding: '15px 25px', fontSize: '13px', color: '#334155', fontWeight: 500 } }, details.type || log.event_type),
                  el('td', { style: { padding: '15px 25px', fontSize: '13px', color: '#64748b', fontFamily: 'monospace', fontWeight: 600 } }, log.ip_address),
                  el('td', { style: { padding: '15px 25px' } }, el('span', {
                    style: {
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: '#fee2e2',
                      color: '#b91c1c',
                      textTransform: 'uppercase'
                    }
                  }, __('Blocked', 'vaptguard')))
                ]);
              }))
          ])
        ])
      ]);
    };

    if (loading) return el('div', { className: 'vapt-loading-full', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px' } }, [el(Spinner), el('p', { style: { marginTop: '15px', color: '#64748b' } }, __('Initializing Secure Environment...', 'vaptguard'))]);
    if (error) return el(Notice, { status: 'error', isDismissible: false }, error);

    const activeDomain = settings.currentDomain || window.location.hostname;

    return el('div', { className: 'vapt-client-root premium-layout', style: { display: 'flex', minHeight: 'calc(100vh - 120px)', background: '#f8fafc' } }, [
      // Sidebar
      el('aside', { className: 'vapt-client-sidebar', style: { width: '280px', background: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' } }, [

        el('div', { className: 'sidebar-menu', style: { padding: '25px', flexGrow: 1 } }, [
          el('div', { style: { fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px', paddingLeft: '10px' } }, __('Protection Status')),
          severityConfigs.map(item => el('div', {
            key: item.id,
            onClick: () => setActiveTab(item.id),
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: '10px',
              cursor: 'pointer',
              marginBottom: '6px',
              background: activeTab === item.id ? '#f1f5f9' : 'transparent',
              color: activeTab === item.id ? '#0f172a' : '#64748b',
              fontWeight: activeTab === item.id ? 700 : 500,
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }
          }, [
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
              el(Icon, { icon: item.icon, size: 18, style: { color: activeTab === item.id ? (item.color || '#0ea5e9') : '#94a3b8' } }),
              item.label
            ]),
            item.count > 0 && el('span', { style: { fontSize: '10px', background: activeTab === item.id ? '#fff' : '#f1f5f9', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, border: '1px solid #e2e8f0' } }, item.count)
          ])),

          el('div', { style: { fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '35px', marginBottom: '20px', paddingLeft: '10px' } }, __('Security Insights')),
          el('div', {
            onClick: () => setActiveTab('stats'),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '10px',
              cursor: 'pointer',
              background: activeTab === 'stats' ? '#f1f5f9' : 'transparent',
              color: activeTab === 'stats' ? '#0f172a' : '#64748b',
              fontWeight: activeTab === 'stats' ? 700 : 500,
              transition: 'all 0.2s'
            }
          }, [
            el(Icon, { icon: 'chart-bar', size: 18, style: { color: activeTab === 'stats' ? '#8b5cf6' : '#94a3b8' } }),
            __('Stats & Live Logs')
          ])
        ])
      ]),

      // Main Content
      el('main', { className: 'vapt-client-main', style: { flexGrow: 1, padding: '40px', overflowY: 'auto' } }, [
        activeTab === 'stats' ? [
          el('h1', { style: { margin: '0 0 30px 0', fontSize: '24px', fontWeight: 800, color: '#1e293b' } }, __('Security Overview')),
          el(StatsDashboard),
          el(LiveSecurityLogs)
        ] : [
          el('div', { className: 'dashboard-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px', padding: '10px 0', borderBottom: '2px solid #f1f5f9' } }, [
            el('div', null, [
              el('h1', { style: { margin: 0, fontSize: '28px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.025em', display: 'flex', alignItems: 'baseline', gap: '10px' } }, [
                __('VAPT Admin Dashboard', 'vaptguard'),
                el('span', { style: { fontSize: '14px', fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px' } }, `v${settings.pluginVersion}`)
              ]),
              el('p', { style: { margin: '5px 0 0 0', fontSize: '14px', color: '#64748b', fontWeight: 500 } }, [
                __('Active Threat Protection for ', 'vaptguard'),
                el('strong', { style: { color: '#0ea5e9' } }, activeDomain)
              ])
            ]),
            el('div', {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
                background: globalProtection ? '#f0fdf9' : '#fef2f2',
                padding: '12px 20px',
                borderRadius: '12px',
                border: `1px solid ${globalProtection ? '#ccfbf1' : '#fee2e2'}`,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }
            }, [
              el('div', { style: { textAlign: 'right' } }, [
                el('div', { style: { fontSize: '12px', fontWeight: 800, color: globalProtection ? '#0d9488' : '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em' } },
                  globalProtection ? __('Protection Active', 'vaptguard') : __('Protection Disabled', 'vaptguard')
                ),
                el('div', { style: { fontSize: '11px', color: '#64748b', fontWeight: 500 } },
                  globalProtection ? __('Site is shielded', 'vaptguard') : __('Protection is offline', 'vaptguard')
                )
              ]),
              el(ToggleControl, {
                label: '',
                checked: globalProtection,
                disabled: globalSaving,
                onChange: (val) => {
                  vaptLog.log('Global Toggle (Optimistic):', val);

                  // Optimistic Update
                  const previousState = globalProtection;
                  setGlobalProtection(val);
                  setSaveStatus({ message: val ? __('Activating Protection...', 'vaptguard') : __('Deactivating Protection...', 'vaptguard'), type: 'info' });

                  apiFetch({
                    path: 'vaptguard/v1/settings/enforcement',
                    method: 'POST',
                    data: { enabled: val }
                  }).then(res => {
                    vaptLog.log('Global Toggle Success:', res);
                    setSaveStatus({ message: __('Settings Saved', 'vaptguard'), type: 'success' });
                    // Refresh data to show consistency
                    fetchData(true);
                  }).catch(err => {
                    vaptLog.error('Global Toggle Error:', err);
                    setGlobalProtection(previousState); // Revert on failure
                    setSaveStatus({ message: __('Failed to update protection', 'vaptguard'), type: 'error' });
                  });
                }
              })
            ])
          ]),

          el('div', { className: 'vapt-feature-list', style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '25px' } },
            filteredFeatures.length === 0 ? el('div', { style: { padding: '60px', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1' } }, [
              el(Icon, { icon: 'shield', size: 48, style: { color: '#e2e8f0', marginBottom: '15px' } }),
              el('p', { style: { color: '#64748b', fontSize: '16px' } }, __('No released protections found for this level.', 'vaptguard'))
            ]) :
              filteredFeatures.map(f => renderFeatureCard(f, updateFeature, setVerifFeature, globalProtection))
          )
        ]
      ]),

      // Portal for saving status
      saveStatus && el('div', {
        style: {
          position: 'fixed', bottom: '30px', right: '30px',
          background: saveStatus.type === 'error' ? '#9b1c1c' : (saveStatus.type === 'success' ? '#059669' : '#1e40af'),
          color: 'white', padding: '12px 24px', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          zIndex: 9999, fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px'
        }
      }, [
        el(Icon, { icon: saveStatus.type === 'error' ? 'warning' : (saveStatus.type === 'success' ? 'yes' : 'update'), size: 18 }),
        saveStatus.message
      ]),

      // Portal for Manual Verification
      verifFeature && el(Modal, {
        title: sprintf(__('Verification Protocol: %s', 'vaptguard'), verifFeature.label),
        onRequestClose: () => setVerifFeature(null),
        className: 'vapt-verif-modal'
      }, (() => {
        const f = verifFeature;
        const schema = typeof f.generated_schema === 'string' ? JSON.parse(f.generated_schema) : (f.generated_schema || { controls: [] });
        const protocol = f.test_method || '';
        const checklist = typeof f.verification_steps === 'string' ? JSON.parse(f.verification_steps) : (f.verification_steps || []);

        return el('div', { style: { padding: '20px' } }, [
          el('h4', null, __('Manual Protocol')),
          el('p', null, protocol || __('No specific manual protocol defined.')),
          checklist.length > 0 && el('div', null, [
            el('h4', null, __('Evidence Checklist')),
            el('ul', null, checklist.map((s, i) => el('li', { key: i }, s)))
          ]),
          el(Button, { isPrimary: true, onClick: () => setVerifFeature(null) }, __('Close'))
        ]);
      })())
    ]);
  };

  const renderFeatureCard = (f, updateFeature, setVerifFeature, globalProtection) => {
    const schema = typeof f.generated_schema === 'string' ? JSON.parse(f.generated_schema) : (f.generated_schema || { controls: [] });

    // v3.14.0: Enforcement Logic
    const isEnforced = globalProtection
      ? ((f.normalized_status || f.status || '').toLowerCase() === 'release' ? (f.is_enforced != 0) : (f.is_enforced == 1))
      : false;

    const isInhibited = !globalProtection && ((f.normalized_status || f.status || '').toLowerCase() === 'release' || (f.is_enforced == 1));

    const statusObj = isEnforced
      ? { label: __('PROTECTION ACTIVE', 'vaptguard'), color: '#10b981', icon: 'yes' }
      : (isInhibited
        ? { label: __('GLOBAL PROTECTION INHIBITED', 'vaptguard'), color: '#94a3b8', icon: 'warning' }
        : { label: __('PROTECTION INACTIVE', 'vaptguard'), color: '#64748b', icon: 'no-alt' }
      );

    const implControls = schema.controls ? schema.controls.filter(c =>
      !['test_action', 'risk_indicators', 'assurance_badges', 'test_checklist', 'evidence_list'].includes(c.type) &&
      !c.label?.toLowerCase().includes('notes')
    ) : [];

    const automControls = schema.controls ? schema.controls.filter(c =>
      c.type === 'test_action' && c.label !== 'Site Integrity Check'
    ) : [];

    return el(Card, {
      key: f.key,
      className: `vapt-feature-card ${isEnforced ? 'active' : ''} ${isInhibited ? 'inhibited' : ''}`,
      style: {
        borderRadius: '16px',
        border: isEnforced ? '2px solid #10b981' : (isInhibited ? '2px dashed #cbd5e1' : '1px solid #e2e8f0'),
        boxShadow: isEnforced ? '0 10px 15px -3px rgba(16, 185, 129, 0.1)' : '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        background: isInhibited ? '#f8fafc' : '#fff'
      }
    }, [
      el(CardHeader, { style: { borderBottom: '1px solid #f1f5f9', padding: '20px 25px', background: '#fff' } }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' } }, [
          el('div', null, [
            el('h3', { style: { margin: 0, fontSize: '17px', fontWeight: 800, color: isInhibited ? '#64748b' : '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' } }, [
              f.label,
              f.severity && el('span', { className: `severity-pill ${f.severity.toLowerCase()}`, style: { fontSize: '10px', fontWeight: 700 } }, f.severity),
              f.include_manual_protocol && el(Tooltip, { text: __('View Verification Protocol', 'vaptguard') },
                el(Button, { isLink: true, onClick: () => setVerifFeature(f), style: { height: 'auto', padding: 0 } },
                  el(Icon, { icon: 'excerpt-view', size: 18, style: { color: '#94a3b8' } })
                )
              )
            ]),
            f.description && el('p', { style: { margin: '6px 0 0 0', fontSize: '12px', color: '#64748b', fontWeight: 500 } }, f.description)
          ]),
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
            el(Icon, { icon: statusObj.icon, size: 16, style: { color: statusObj.color } }),
            el('span', { style: { fontSize: '11px', fontWeight: 800, color: statusObj.color, textTransform: 'uppercase', letterSpacing: '0.05em' } }, statusObj.label)
          ])
        ])
      ]),
      el(CardBody, { style: { padding: '0' } }, [
        el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '200px' } }, [
          // Security Configuration Column
          el('div', { style: { padding: '25px', background: isInhibited ? '#f1f5f9' : '#fcfdfd', borderRight: '1px solid #f1f5f9' } }, [
            el('h4', { style: { fontSize: '11px', fontWeight: 800, marginBottom: '20px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' } }, [
              el(Icon, { icon: 'admin-settings', size: 16 }),
              __('Functional Implementation')
            ]),
            implControls.length > 0 ? el(GeneratedInterface, {
              feature: { ...f, generated_schema: { ...schema, controls: implControls } },
              globalProtection: globalProtection,
              onUpdate: (data) => updateFeature(f.key, { implementation_data: data })
            }) : el('p', { style: { fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' } }, __('Standard protection rules active.'))
          ]),
          // Verification Engine Column
          el('div', { style: { padding: '25px', background: '#f8fafc' } }, [
            el('h4', { style: { fontSize: '11px', fontWeight: 800, marginBottom: '20px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' } }, [
              el(Icon, { icon: 'shield', size: 16 }),
              __('Automated Verification Engine')
            ]),
            automControls.length > 0 ? el(GeneratedInterface, {
              feature: { ...f, generated_schema: { ...schema, controls: automControls } },
              globalProtection: globalProtection,
              hideOpNotes: true,
              hideProtocol: true,
              onUpdate: (data) => updateFeature(f.key, { implementation_data: data })
            }) : el('p', { style: { fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' } }, __('Automated monitoring active.'))
          ])
        ])
      ]),
    ]);
  };

  const init = () => {
    const container = document.getElementById('vapt-client-root');
    if (container) render(el(ClientDashboard), container);
  };
  if (document.readyState === 'complete') init();
  else document.addEventListener('DOMContentLoaded', init);
})();

