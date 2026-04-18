// Global check-in for diagnostics - ABSOLUTE TOP
window.vaptScriptLoaded = true;

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
  if (typeof wp === 'undefined') {
    vaptLog.error('"wp" global is missing!');
    return;
  }

  const { render, useState, useEffect, useMemo, Fragment, createElement: el } = wp.element || {};
  const components = wp.components || {};
  const {
    TabPanel, Panel, PanelBody, PanelRow, Button, Dashicon,
    ToggleControl, SelectControl, Modal, TextControl, Spinner,
    Notice, Placeholder, Dropdown, CheckboxControl, BaseControl, Icon,
    TextareaControl, Card, CardHeader, CardBody, Tooltip
  } = {
    TabPanel: components.TabPanel || components.__experimentalTabPanel,
    Panel: components.Panel,
    PanelBody: components.PanelBody,
    PanelRow: components.PanelRow,
    Button: components.Button,
    Dashicon: components.Dashicon,
    ToggleControl: components.ToggleControl,
    SelectControl: components.SelectControl,
    Modal: components.Modal,
    TextControl: components.TextControl,
    Spinner: components.Spinner,
    Notice: components.Notice,
    Placeholder: components.Placeholder,
    Dropdown: components.Dropdown,
    CheckboxControl: components.CheckboxControl,
    BaseControl: components.BaseControl,
    Icon: components.Icon,
    TextareaControl: components.TextareaControl,
    Card: components.Card,
    CardHeader: components.CardHeader,
    CardBody: components.CardBody,
    Tooltip: components.Tooltip || components.__experimentalTooltip
  };
  // Global Settings from wp_localize_script (MOVED TO TOP v3.8.11)
  const settings = window.vaptguardSettings || {};
  const isSuper = settings.isSuper || false;

  // 🛡️ GLOBAL REST HOTPATCH (v3.8.16)
  // Replaces the global wp.apiFetch to catch 404s from any component (Core or Plugin)
  if (wp.apiFetch && !wp.apiFetch.__vaptguard_patched) {
    let localBroken = localStorage.getItem('vaptguard_rest_broken') === '1';
    const originalApiFetch = wp.apiFetch;

    const patchedApiFetch = (args) => {
      // 🛡️ AUTH PERI-FIX: Ensure Nonce is present for non-GET requests
      if (settings.nonce && args.method && args.method !== 'GET') {
        args.headers = Object.assign({}, args.headers || {}, { 'X-WP-Nonce': settings.nonce });
      }

      const getFallbackUrl = (pathOrUrl) => {
        if (!pathOrUrl) return null;
        const path = typeof pathOrUrl === 'string' && pathOrUrl.includes('/wp-json/')
          ? pathOrUrl.split('/wp-json/')[1]
          : pathOrUrl;
        const cleanHome = settings.homeUrl.replace(/\/$/, '');
        const cleanPath = path.replace(/^\//, '').split('?')[0];
        const queryParams = path.includes('?') ? '&' + path.split('?')[1] : '';
        const nonceParam = settings.nonce ? '&_wpnonce=' + settings.nonce : '';
        return cleanHome + '/?rest_route=/' + cleanPath + queryParams + nonceParam;
      };

      // 🛡️ Pre-emptive Fallback if we already know REST is broken
      if (localBroken && (args.path || args.url) && settings.homeUrl) {
        const fallbackUrl = getFallbackUrl(args.path || args.url);
        if (fallbackUrl) {
          const fallbackArgs = Object.assign({}, args, { url: fallbackUrl });
          delete fallbackArgs.path;
          return originalApiFetch(fallbackArgs);
        }
      }

      return originalApiFetch(args).catch(err => {
        const status = err.status || (err.data && err.data.status);
        // 🛡️ Trigger fallback on 403/404 OR invalid_json (common when server returns HTML for error)
        const isFallbackTrigger = status === 404 || status === 403 || err.code === 'rest_no_route' || err.code === 'invalid_json';

        if (isFallbackTrigger && (args.path || args.url) && settings.homeUrl) {
          const fallbackUrl = getFallbackUrl(args.path || args.url);
          if (!fallbackUrl) throw err;

          if (!localBroken) {
            vaptLog.warn('Switching to Pre-emptive Mode (Silent) for REST API.');
            localBroken = true;
            localStorage.setItem('vaptguard_rest_broken', '1');
          }

          const fallbackArgs = Object.assign({}, args, { url: fallbackUrl });
          delete fallbackArgs.path;
          return originalApiFetch(fallbackArgs);
        }
        throw err;
      });
    };

    // Copy properties like .use, .createNonceMiddleware, etc.
    Object.keys(originalApiFetch).forEach(key => {
      patchedApiFetch[key] = originalApiFetch[key];
    });
    patchedApiFetch.__vaptguard_patched = true;
    wp.apiFetch = patchedApiFetch;
  }

  const apiFetch = wp.apiFetch;
  const { __, sprintf } = wp.i18n || {};

  // Error Boundary Component
  class ErrorBoundary extends wp.element.Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
      return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
      vaptLog.error("React Error:", error, errorInfo);
      this.setState({ errorInfo });
    }

    render() {
      if (this.state.hasError) {
        return el('div', { className: 'notice notice-error inline', style: { padding: '20px', margin: '20px' } }, [
          el('h3', null, 'Something went wrong rendering the VAPT Secure Dashboard.'),
          el('details', { style: { whiteSpace: 'pre-wrap', marginTop: '10px' } },
            this.state.error && this.state.error.toString(),
            el('br'),
            this.state.errorInfo && this.state.errorInfo.componentStack
          )
        ]);
      }
      return this.props.children;
    }
  }

  // Global Settings moved to top

  // Import Auto-Generator
  const Generator = window.vaptguard_Generator;
  // Import Generated Interface UI
  const GeneratedInterface = window.vaptguard_GeneratedInterface;

  if (!wp.element || !wp.components || !wp.apiFetch || !wp.i18n) {
    vaptLog.error('One or more WordPress dependencies are missing!');
    return;
  }

  // Shared Modal Components
  const vaptguard_AlertModal = ({ isOpen, message, onClose, type = 'error' }) => {
    if (!isOpen) return null;
    return el(Modal, {
      title: type === 'error' ? __('Error', 'vaptguard') : __('Notice', 'vaptguard'),
      onRequestClose: onClose,
      style: { maxWidth: '400px' },
      className: 'vapt-alert-modal'
    }, [
      el('div', { style: { display: 'flex', gap: '15px', alignItems: 'flex-start', marginBottom: '20px' } }, [
        el(Icon, {
          icon: type === 'error' ? 'warning' : 'info',
          size: 32,
          style: {
            color: type === 'error' ? '#dc2626' : '#2563eb',
            background: type === 'error' ? '#fef2f2' : '#eff6ff',
            padding: '8px',
            borderRadius: '50%',
            flexShrink: 0
          }
        }),
        el('div', { style: { paddingTop: '4px' } }, [
          el('h3', { style: { margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 } }, type === 'error' ? 'Action Failed' : 'Notice'),
          el('p', { style: { margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: '1.5' } }, message)
        ])
      ]),
      el('div', { style: { textAlign: 'right', borderTop: '1px solid #e5e7eb', paddingTop: '15px', marginTop: '10px' } },
        el(Button, { isPrimary: true, onClick: onClose }, __('OK', 'vaptguard'))
      )
    ]);
  };

  const vaptguard_ConfirmModal = ({ isOpen, message, onConfirm, onCancel, confirmLabel = __('Yes', 'vaptguard'), isDestructive = false }) => {
    if (!isOpen) return null;
    return el(Modal, {
      title: __('Confirmation', 'vaptguard'),
      onRequestClose: onCancel,
      className: 'vapt-confirm-modal-react'
    }, [
      el('div', { className: 'vapt-modal-body' }, [
        el('div', { style: { display: 'flex', gap: '15px', alignItems: 'flex-start', marginBottom: '20px' } }, [
          el(Icon, {
            icon: 'warning',
            size: 32,
            style: {
              color: '#d97706',
              background: '#fffbeb',
              padding: '8px',
              borderRadius: '50%',
              flexShrink: 0
            }
          }),
          el('div', { style: { paddingTop: '4px' } }, [
            el('h3', { style: { margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 } }, __('Are you sure?', 'vaptguard')),
            el('p', { style: { margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: '1.5', whiteSpace: 'pre-line' } }, message)
          ])
        ])
      ]),
      el('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e5e7eb', paddingTop: '15px', marginTop: '10px' } }, [
        el(Button, { isSecondary: true, onClick: onCancel }, __('Cancel', 'vaptguard')),
        el(Button, { isDestructive: isDestructive, isPrimary: !isDestructive, onClick: onConfirm }, confirmLabel)
      ])
    ]);
  };

  // History Modal Component
  const HistoryModal = ({ feature, updateFeature, onClose }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      apiFetch({ path: `vaptguard/v1/features/${feature.key || feature.id}/history` })
        .then(res => {
          setHistory(res);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, [feature.key || feature.id]);

    const [confirmState, setConfirmState] = useState(null);

    const resetHistory = () => {
      setConfirmState({
        message: sprintf(__('Are you sure you want to reset history for "%s"?\n\nThis will:\n1. Clear all history records.\n2. Reset status to "Draft".', 'vaptguard'), feature.label),
        isDestructive: true,
        onConfirm: () => {
          setConfirmState(null);
          setLoading(true);
          updateFeature(feature.key || feature.id, {
            status: 'Draft',
            reset_history: true,
            has_history: false,
            history_note: 'History Reset by User',
            generated_schema: null,
            implementation_data: null,
            wireframe_url: '',
            include_verification_engine: 0,
            include_verification_guidance: 0
          }).then(() => {
            setLoading(false);
            onClose();
          });
        }
      });
    };

    return el(Modal, {
      id: 'vapt-history-modal',
      title: sprintf(__('History: %s', 'vaptguard'), feature.name || feature.label),
      onRequestClose: onClose,
      className: 'vapt-history-modal'
    }, [
      el('div', { id: 'vapt-history-modal-actions', className: 'vapt-flex-between', style: { marginBottom: '10px' } }, [
        el('div', null), // Spacer
        el(Button, {
          id: 'vapt-btn-reset-history',
          isDestructive: true,
          isSmall: true,
          icon: 'trash',
          onClick: resetHistory,
          disabled: loading || history.length === 0
        }, __('Reset History & Status', 'vaptguard'))
      ]),
      loading ? el(Spinner) : el('div', { id: 'vapt-history-modal-table-wrap' }, [
        history.length === 0 ? el('p', null, __('No history recorded yet.', 'vaptguard')) :
          el('table', { className: 'wp-list-table widefat fixed striped' }, [
            el('thead', null, el('tr', null, [
              el('th', { style: { width: '120px' } }, __('Date', 'vaptguard')),
              el('th', { style: { width: '100px' } }, __('From', 'vaptguard')),
              el('th', { style: { width: '100px' } }, __('To', 'vaptguard')),
              el('th', { style: { width: '120px' } }, __('User', 'vaptguard')),
              el('th', null, __('Note', 'vaptguard')),
            ])),
            el('tbody', null, history.map((h, i) => el('tr', { key: i }, [
              el('td', null, new Date(h.created_at).toLocaleString()),
              el('td', null, el('span', { className: `vapt-status-badge status-${h.old_status}` }, h.old_status)),
              el('td', null, el('span', { className: `vapt-status-badge status-${h.new_status}` }, h.new_status)),
              el('td', null, h.user_name || __('System', 'vaptguard')),
              el('td', null, h.note || '-')
            ])))
          ])
      ]),
      el('div', { style: { marginTop: '20px', textAlign: 'right' } }, [
        el(Button, { isPrimary: true, onClick: onClose }, __('Close', 'vaptguard'))
      ]),
      confirmState && el(vaptguard_ConfirmModal, {
        isOpen: true,
        message: confirmState.message,
        isDestructive: confirmState.isDestructive,
        onConfirm: confirmState.onConfirm,
        onCancel: () => setConfirmState(null)
      })
    ]);
  };


  // Design/Schema Modal
  const DesignModal = ({ feature, onClose, updateFeature, designPromptConfig, setDesignPromptConfig, setIsPromptConfigModalOpen, selectedFile, fieldMapping, rootAiInstructions, rootGlobalSettings }) => {
    // Default prompt for guidance but still valid JSON (v3.6.11)
    const MEANINGFUL_DEFAULT = {
      "controls": [
        {
          "type": "header",
          "label": "Feature Configuration"
        },
        {
          "type": "toggle",
          "label": "Enable Feature",
          "key": "feat_enabled",
          "default": true
        }
      ],
      "enforcement": {
        "driver": "hook",
        "mappings": {
          "feat_enabled": "your_backend_hook_here"
        }
      },
      "_instructions": "Paste the AI-generated JSON here to replace this default."
    };

    const getInitialSchema = () => {
      if (!feature.generated_schema) return MEANINGFUL_DEFAULT;
      if (typeof feature.generated_schema === 'string') {
        try {
          const parsed = JSON.parse(feature.generated_schema);
          // Standardize empty/invalid schemas
          if (!parsed || (Array.isArray(parsed) && parsed.length === 0) || (typeof parsed === 'object' && Object.keys(parsed).length === 0)) {
            return MEANINGFUL_DEFAULT;
          }
          // If double-encoded, parse again
          if (typeof parsed === 'string') {
            const doubleParsed = JSON.parse(parsed);
            if (!doubleParsed || (Array.isArray(doubleParsed) && doubleParsed.length === 0)) return MEANINGFUL_DEFAULT;
            return doubleParsed;
          }
          return parsed;
        } catch (e) {
          return MEANINGFUL_DEFAULT;
        }
      }
      // Direct object check
      if (Array.isArray(feature.generated_schema) && feature.generated_schema.length === 0) return MEANINGFUL_DEFAULT;
      if (typeof feature.generated_schema === 'object' && Object.keys(feature.generated_schema).length === 0) return MEANINGFUL_DEFAULT;

      return feature.generated_schema;
    };

    const initialParsed = getInitialSchema();
    const defaultValue = JSON.stringify(initialParsed, null, 2);

    const [schemaText, setSchemaText] = useState(defaultValue);
    const [parsedSchema, setParsedSchema] = useState(initialParsed);
    const [localImplData, setLocalImplData] = useState(
      feature.implementation_data ? (typeof feature.implementation_data === 'string' ? JSON.parse(feature.implementation_data) : feature.implementation_data) : {}
    );
    const [customizationText, setCustomizationText] = useState(feature.dev_instruct || '');
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);

    // Toggles for Feature Display (v3.3.1)
    const [includeProtocol, setIncludeProtocol] = useState((feature.include_manual_protocol === undefined || feature.include_manual_protocol === null) ? true : feature.include_manual_protocol == 1);
    const [includeNotes, setIncludeNotes] = useState((feature.include_operational_notes === undefined || feature.include_operational_notes === null) ? true : feature.include_operational_notes == 1);

    // Hybrid Mode: Multi-Env v3.1 vs Standard v2.0 (v4.0.0)
    const [isMultiEnv, setIsMultiEnv] = useState(false);
    const [isAdaptiveDeployment, setIsAdaptiveDeployment] = useState(feature.is_adaptive_deployment == 1);

    // New: Hover state for paste logic
    const [isHoveringSchema, setIsHoveringSchema] = useState(false);

    // Handle "Replace on Hover" Paste Logic
    useEffect(() => {
      const handleGlobalPaste = (e) => {
        if (isHoveringSchema) {
          e.preventDefault();
          const text = (e.clipboardData || window.clipboardData).getData('text');
          if (text) {
            onJsonChange(text);
            setSaveStatus({ message: __('Content Replaced from Clipboard!', 'vaptguard'), type: 'success' });
            setTimeout(() => setSaveStatus(null), 2000);
          }
        }
      };
      window.addEventListener('paste', handleGlobalPaste);
      return () => window.removeEventListener('paste', handleGlobalPaste);
    }, [isHoveringSchema]);

    // Prevent body scroll when modal is open
    useEffect(() => {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }, []);

    // State for Alerts and Confirms
    const [alertState, setAlertState] = useState(null);
    const [confirmState, setConfirmState] = useState(null);

    // State for Remove Confirmation Modal
    const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);

    // Handle real-time preview
    const onJsonChange = (val) => {
      setSchemaText(val);
      try {
        const parsed = JSON.parse(val);
        if (parsed && parsed.controls) setParsedSchema(parsed);
      } catch (e) {
        // Silent fail for preview while typing
      }
    };

    const handleSave = () => {
      try {
        // Attempt to clean common paste artifacts (Markdown code blocks & invisible chars)
        let cleanText = schemaText.trim();

        // Remove markdown code fences if present at start/end
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        }

        // Replace non-breaking spaces with normal spaces
        cleanText = cleanText.replace(/\u00A0/g, ' ');
        // Remove zero-width spaces and other invisible formatting chars
        cleanText = cleanText.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

        const parsed = JSON.parse(cleanText);
        const controls = Array.isArray(parsed.controls) ? parsed.controls : [];
        const hasTestActions = controls.some(c => c.type === 'test_action');

        setIsSaving(true);
        const payload = {
          generated_schema: JSON.stringify(parsed),
          implementation_data: JSON.stringify(localImplData),
          is_enforced: 1, // Force activation on Save & Deploy (v3.12.3)
          is_adaptive_deployment: isAdaptiveDeployment ? 1 : 0,
          include_verification_engine: hasTestActions ? 1 : 0,
          include_verification_guidance: 1,
          include_manual_protocol: includeProtocol ? 1 : 0,
          include_operational_notes: includeNotes ? 1 : 0,
        };

        // Auto-transition from Draft to Develop on first Save & Deploy (v3.13.0)
        if (feature.normalized_status === 'draft') {
          payload.status = 'Develop';
        }

        updateFeature(feature.key || feature.id, {
          ...payload,
          dev_instruct: customizationText
        })
          .then(() => {
            setIsSaving(false);
            onClose();
          })
          .catch(() => setIsSaving(false));
      } catch (e) {
        vaptLog.error('Design Save Error:', e);
        if (e instanceof SyntaxError) {
          setAlertState({ message: sprintf(__('Invalid JSON format: %s. Check for hidden characters or syntax errors.', 'vaptguard'), e.message) });
        } else {
          setAlertState({ message: sprintf(__('Execution Error: %s. Please report this to support.', 'vaptguard'), e.message) });
        }
      }
    };

    const handleRemoveConfirm = () => {
      setIsSaving(true);
      updateFeature(feature.key || feature.id, {
        status: 'Draft',
        generated_schema: null,
        implementation_data: null,
        is_enforced: 0,          // v1.9.5: clear enforcement state on schema removal
        include_verification_engine: 0,
        include_verification_guidance: 0,
        reset_history: true,
        has_history: false
      })
        .then(() => {
          setIsSaving(false);
          setIsRemoveConfirmOpen(false); // Close confirm modal
          onClose(); // Close main modal
        })
        .catch(() => {
          setIsSaving(false);
          setIsRemoveConfirmOpen(false);
          setAlertState({ message: __('Failed to remove implementation.', 'vaptguard') });
        });
    };

    const copyContext = () => {
      // Build context (v3.13.3)
      let contextJson = `
{
  "site_context": {
    "home_url": "${settings.homeUrl || ''}",
    "plugin_name": "${settings.pluginName || 'VAPT Secure'}",
    "environment": "production",
    "mandate": "All URLs generated in the final JSON schema MUST be absolute URLs, using the provided home_url as the base."
  },
  "feature_blueprint": {
    "id": "feature_id",
    "title": "feature_title",
    "description": "feature_description",
    "severity": "feature_severity",
    "category": "feature_category",
    "compliance_references": "feature_owasp",
    "cwe_reference": "feature_cwe",
    "remediation_strategy": "feature_remediation",
    "evidence_requirements": "feature_evidence_requirements",
    "verification_steps": "feature_verification_steps",
    "test_method": "feature_test_method",
    "ui_components": {
      "primary_card": "automation_prompts.ai_ui",
      "test_checklist": "tests",
      "risk_indicators": "risks",
      "assurance_badges": "assurance",
      "evidence_list": "evidence"
    },
    "interface_layout": {
      "grid_structure": "Two-Column (Controls Left, Status Right)",
      "functional_blocks": [
        "Implementation Notes (Contextual Textarea)",
        "Manual Verification (Full-Width Protocol & Evidence Checklist)",
        "Automated Verification (Trigger Actions & Live Status)"
      ],
      "styling": "Standardized cards with subtle shadows and clear hierarchy."
    },
    "automation_context": {
      "ai_check_prompt": "automation_prompts.ai_check",
      "ai_schema_fields": "automation_prompts.ai_schema",
      "ai_agent_instructions": "ai_agent_instructions",
      "global_settings": "global_settings"
    },
    "risk_properties": {
      "cvss_score": "cvss_score",
      "cvss_vector": "cvss_vector",
      "affected_components": "affected_components",
      "performance_impact": "performance_impact"
    },
    "protection_details": "protection_details",
    "testing_specs": "testing_specs",
    "verification_engine": "verification_engine",
    "relationships": "relationships",
    "reporting": "reporting",
    "references": "references",
    "implementation_strategy": {
      "execution_driver": "Prioritize: prioritizedDriver",
      "enforcement_mechanism": "Intelligent automated selection based on active datasource.",
      "decision_matrix": {
        "driver: htaccess": "Use for physical files, server-wide blocking, or headers. Requires 'target': 'root'.",
        "driver: wp-config": "Use for wp-config.php constants (defines).",
        "driver: hook": "Use for dynamic PHP logic, headers, request interceptions (wp_head, init).",
        "driver: manual": "Use for directives that require manual server configuration (e.g. Nginx, System Services)."
      },
      "available_methods": [
        "block_xmlrpc",
        "add_security_headers",
        "hide_wp_version",
        "block_user_enumeration",
        "disable_file_editors",
        "block_debug_exposure",
        "limit_login_attempts",
        "block_wp_cron",
        "block_rest_api"
      ],
      "data_binding": "Controls must use 'key' to bind to enforcer logic."
    },
    "verification_protocol": {
      "automated_verification": "Interactive test actions (universal_probe) for real-time proof"
    },
    "ui_blueprint": "ui_configuration",
    "implementation_logic": {
      "automated_steps": "automated_steps",
      "manual_steps": "manual_steps"
    },
    "raw_feature_context": "raw_json",
    "previous_implementation": "previous_schema"
  }
}
`;

      // 1. Determine Driver Priority based on Selection or VAPT v2.0 Strategy
      // Preferred Order: .htaccess, PHP Function, wp-config
      let prioritizedDriver = 'hook';
      let driverContextInstruction = '';

      const selection = feature.active_enforcer;
      const targets = feature.protection?.automated_protection?.implementation_targets || feature.available_platforms || [];

      if (selection) {
        const selLower = selection.toLowerCase();
        if (selLower.includes('htaccess') || selLower === 'apache' || selLower === 'litespeed') prioritizedDriver = 'htaccess';
        else if (selLower.includes('functions') || selLower.includes('hook') || selLower === 'wordpress' || selLower === 'php') prioritizedDriver = 'hook';
        else if (selLower.includes('wp-config')) prioritizedDriver = 'wp-config';
        else if (selLower === 'fail2ban') prioritizedDriver = 'fail2ban';
        else if (selLower === 'nginx') prioritizedDriver = 'nginx';
        else if (selLower === 'cloudflare') prioritizedDriver = 'cloudflare';
        else if (selLower === 'iis') prioritizedDriver = 'iis';
        else if (selLower === 'caddy') prioritizedDriver = 'caddy';

        driverContextInstruction = `\n      - **USER SELECTION**: The user explicitly selected **${selection}** as the enforcer. Use the **${prioritizedDriver}** driver core strategy.`;
      } else if (Array.isArray(targets) && targets.length > 0) {
        if (targets.includes('.htaccess')) prioritizedDriver = 'htaccess';
        else if (targets.includes('PHP Hook') || targets.includes('WordPress') || targets.includes('PHP Functions') || targets.includes('WordPress Core')) prioritizedDriver = 'hook';
        else if (targets.includes('wp-config.php')) prioritizedDriver = 'wp-config';
        else if (targets.includes('fail2ban')) prioritizedDriver = 'fail2ban';
        else if (targets.includes('Nginx')) prioritizedDriver = 'nginx';
        else if (targets.includes('Cloudflare')) prioritizedDriver = 'cloudflare';
        else if (targets.includes('IIS')) prioritizedDriver = 'iis';
        else if (targets.includes('Caddy')) prioritizedDriver = 'caddy';
        else if (targets.includes('Litespeed')) prioritizedDriver = 'htaccess';

        driverContextInstruction = `\n      - **STRATEGY**: The feature supports [${targets.join(', ')}]. Priority Driver: **${prioritizedDriver}**.`;
      } else {
        const dsLower = (selectedFile || '').toLowerCase();
        if (dsLower.includes('htaccess')) prioritizedDriver = 'htaccess';
        else if (dsLower.includes('hook') || dsLower.includes('php')) prioritizedDriver = 'hook';
        else if (dsLower.includes('wp-config')) prioritizedDriver = 'wp-config';
        else if (dsLower.includes('nginx')) prioritizedDriver = 'nginx';
        else if (dsLower.includes('fail2ban')) prioritizedDriver = 'fail2ban';
      }

      if (designPromptConfig) {
        contextJson = typeof designPromptConfig === 'string'
          ? designPromptConfig
          : JSON.stringify(designPromptConfig, null, 2);
      } else {
        const defaultTemplate = {
          "design_prompt": {
            "interface_version": isMultiEnv ? "3.2.0" : "2.0",
            "schema_grade": isMultiEnv ? "A+" : "Standard",
            "interface_type": "Interactive VAPT Functional Workbench",
            "schema_definition": isMultiEnv ? "VAPT A+ Client-Ready Multi-Environment Interface Schema v3.2" : "WordPress VAPT schema with standardized control fields",
            "id": "{{id}}",
            "title": "{{title}}",
            "description": "{{description}}",
            "severity": "{{severity}}",
            "category": "{{category}}",
            "compliance_references": "{{owasp}}",
            "cwe_reference": "{{cwe}}",
            "remediation_strategy": "{{remediation}}",
            "evidence_requirements": "{{evidence_requirements}}",
            "verification_steps": "{{verification_steps}}",
            "test_method": "{{test_method}}",
            "visual_indicator": "shield",
            "ui_components": {
              "primary_card": "{{automation_prompts.ai_ui}}",
              "test_checklist": "{{tests}}",
              "risk_indicators": "{{risks}}",
              "assurance_badges": "{{assurance}}",
              "evidence_list": "{{evidence}}"
            },
            "interface_layout": {
              "grid_structure": "Two-Column (Controls Left, Status Right)",
              "functional_blocks": [
                "Implementation Notes (Contextual Textarea)",
                "Manual Verification (Full-Width Protocol & Evidence Checklist)",
                "Automated Verification (Trigger Actions & Live Status)"
              ],
              "styling": "Standardized cards with subtle shadows and clear hierarchy."
            },
            "automation_context": {
              "ai_check_prompt": "{{automation_prompts.ai_check}}",
              "ai_schema_fields": "{{automation_prompts.ai_schema}}",
              "ai_agent_instructions": "{{ai_agent_instructions}}",
              "global_settings": "{{global_settings}}",
              "telemetry": { "log_events": true, "audit_trail": true }
            },
            "risk_properties": {
              "cvss_score": "{{cvss_score}}",
              "cvss_vector": "{{cvss_vector}}",
              "affected_components": "{{affected_components}}",
              "performance_impact": "{{performance_impact}}"
            },
            "protection_details": "{{protection_details}}",
            "testing_specs": "{{testing_specs}}",
            "verification_engine": "{{verification_engine}}",
            "relationships": "{{relationships}}",
            "reporting": "{{reporting}}",
            "references": "{{references}}",
            "multi_environment": isMultiEnv ? {
              "mode": "runtime_detection",
              "supported_platforms": ["apache_htaccess", "nginx_config", "iis_config", "caddy_config", "cloudflare_edge", "php_functions"],
              "fallback_strategy": "cascade",
              "runtime_selection": "maximize_protection_capability"
            } : null
          }
        };
        contextJson = JSON.stringify(defaultTemplate, null, 2);
      }

      // 2. Extract Development Guidance
      let displayInstruct = feature.dev_instruct || feature.devInstruct || feature.ai_agent_instructions || '';
      if (!displayInstruct && feature.generated_schema) {
        try {
          const schema = typeof feature.generated_schema === 'string' ? JSON.parse(feature.generated_schema) : feature.generated_schema;
          if (schema && schema.instruction) displayInstruct = schema.instruction;
        } catch (e) { }
      }
      if (!displayInstruct) displayInstruct = 'No specific guidelines provided.';

      // 3. Extract Reference Code
      let referenceCode = '';
      if (feature.code_examples && Array.isArray(feature.code_examples)) {
        referenceCode = feature.code_examples.map(ex => {
          return `Language: ${ex.language || 'PHP'}\nDescription: ${ex.description || 'Implementation Logic'}\nCode:\n${ex.code}`;
        }).join('\n\n');
      }

      // 4. Replace Placeholders
      const replaceAll = (str, key, val) => {
        const value = Array.isArray(val) ? val.join(', ') : (val || '');
        return str.split(`{{${key}}}`).join(value).split(`{${key}}`).join(value);
      };

      // Mapped Data Extraction
      const rawDesc = getMappedContent(feature, 'description', 'description', fieldMapping);
      const rawSev = getMappedContent(feature, 'severity', 'severity', fieldMapping);
      const rawMethod = getMappedContent(feature, 'test_method', 'test_method', fieldMapping);
      const rawVerif = getMappedContent(feature, 'verification_steps', 'verification_steps', fieldMapping); // Array or String
      const rawOwasp = getMappedContent(feature, 'owasp', 'owasp', fieldMapping) || getMappedContent(feature, 'compliance', 'owasp_mapping', fieldMapping) || feature.owasp || '';
      const rawRemediation = getMappedContent(feature, 'remediation', 'remediation', fieldMapping);
      const rawScenario = getMappedContent(feature, 'attack_scenario', 'attack_scenario', fieldMapping);
      // interface_schema_full125.json — new mapped fields
      const rawCvssScore = getMappedContent(feature, 'cvss_score', 'cvss_score', fieldMapping) || feature.cvss_score || '';
      const rawPriority = getMappedContent(feature, 'priority', 'priority', fieldMapping) || feature.priority || '';
      const rawEstTime = getMappedContent(feature, 'estimated_time', 'estimated_time', fieldMapping) || feature.estimated_time || '';
      const rawRemEffort = getMappedContent(feature, 'remediation_effort', 'remediation_effort', fieldMapping) || feature.remediation_effort || '';
      const rawPlatforms = getMappedContent(feature, 'available_platforms', 'available_platforms', fieldMapping) || feature.available_platforms || [];
      const rawPlatformImpl = getMappedContent(feature, 'platform_implementations', 'platform_implementations', fieldMapping) || feature.platform_implementations || {};
      const rawUiLayout = getMappedContent(feature, 'ui_layout', 'ui_layout', fieldMapping) || feature.ui_layout || {};
      const rawComponents = getMappedContent(feature, 'components', 'components', fieldMapping) || feature.components || [];
      const rawActions = getMappedContent(feature, 'actions', 'actions', fieldMapping) || feature.actions || [];

      const formatValue = (val) => {
        if (Array.isArray(val)) return val.join('\n');
        if (typeof val === 'object' && val !== null) return JSON.stringify(val, null, 2);
        return val || '';
      };

      contextJson = replaceAll(contextJson, 'id', feature.id || 'N/A');
      contextJson = replaceAll(contextJson, 'title', feature.name || feature.label || feature.title || '');
      contextJson = replaceAll(contextJson, 'category', feature.category || 'General');
      contextJson = replaceAll(contextJson, 'description', formatValue(rawDesc) || 'None provided');
      contextJson = replaceAll(contextJson, 'severity', (typeof rawSev === 'object' ? rawSev.level : rawSev) || 'Medium');
      contextJson = replaceAll(contextJson, 'remediation', formatValue(rawRemediation));
      contextJson = replaceAll(contextJson, 'owasp', formatValue(rawOwasp));
      contextJson = replaceAll(contextJson, 'cwe', feature.cwe || '');
      contextJson = replaceAll(contextJson, 'risks', Array.isArray(feature.risks) ? feature.risks.join(', ') : (feature.risks || ''));
      contextJson = replaceAll(contextJson, 'verification_steps', formatValue(rawVerif));

      // Extra Data Points (v1.4.0)
      const testingSpecs = {
        payloads: feature.testing?.test_payloads || [],
        tools: feature.testing?.tools_required || []
      };
      contextJson = replaceAll(contextJson, 'testing_specs', JSON.stringify(testingSpecs, null, 2));

      // Enhanced Extraction (v3.13.1) - Critical & High Importance
      // Hyper-Personalization: Prioritize source-specific root nodes attached to the feature (v3.13.1)
      const aiInstructions = { ...rootAiInstructions, ...(feature.root_ai_agent_instructions || {}), ...(feature.ai_agent_instructions || {}) };
      const globalSettings = { ...rootGlobalSettings, ...(feature.root_global_settings || {}), ...(feature.global_settings || {}) };

      const testing = feature.testing || {};
      const verifEngine = feature.verification_engine || {};
      const relationships = feature.relationships || {};
      const perfImpact = feature.performance_impact || {};

      contextJson = replaceAll(contextJson, 'ai_agent_instructions', JSON.stringify(aiInstructions, null, 2));
      contextJson = replaceAll(contextJson, 'global_settings', JSON.stringify(globalSettings, null, 2));

      // Risk Identity — use new mapped fields first, fall back to schema-level fields
      const cvssScore = rawCvssScore || (typeof rawSev === 'object' ? rawSev.cvss_score : '') || '';
      const cvssVector = (typeof rawSev === 'object' ? rawSev.cvss_vector : '') || '';
      const affectedComponents = (typeof rawDesc === 'object' ? rawDesc.affected_components : '') || '';

      contextJson = replaceAll(contextJson, 'cvss_score', cvssScore);
      contextJson = replaceAll(contextJson, 'cvss_vector', cvssVector);
      contextJson = replaceAll(contextJson, 'affected_components', Array.isArray(affectedComponents) ? affectedComponents.join(', ') : (affectedComponents || ''));

      // Protection Details — wired through new field mappings (interface_schema_full125.json)
      const protection = feature.protection || {};
      const protectionDetails = {
        available_platforms: Array.isArray(rawPlatforms) ? rawPlatforms : (protection.plugin_dependencies || []),
        platform_implementations: rawPlatformImpl
      };
      contextJson = replaceAll(contextJson, 'protection_details', JSON.stringify(protectionDetails, null, 2));

      // UI Schema Components for AI >95% Accuracy Workflow
      contextJson = replaceAll(contextJson, 'ui_layout', JSON.stringify(rawUiLayout, null, 2));
      contextJson = replaceAll(contextJson, 'components', JSON.stringify(rawComponents, null, 2));
      contextJson = replaceAll(contextJson, 'actions', JSON.stringify(rawActions, null, 2));

      // Testing Specs
      const testingSpecsFull = {
        payloads: testing.test_payloads || [],
        difficulty: testing.difficulty || 'Medium',
        tools: testing.tools_required || []
      };
      contextJson = replaceAll(contextJson, 'testing_specs', JSON.stringify(testingSpecsFull, null, 2));

      // Verification Engine & Relationships
      contextJson = replaceAll(contextJson, 'verification_engine', JSON.stringify(verifEngine, null, 2));
      contextJson = replaceAll(contextJson, 'relationships', JSON.stringify(relationships, null, 2));
      contextJson = replaceAll(contextJson, 'performance_impact', JSON.stringify(perfImpact, null, 2));

      // Reporting & References
      contextJson = replaceAll(contextJson, 'reporting', JSON.stringify(feature.reporting || {}, null, 2));
      contextJson = replaceAll(contextJson, 'references', JSON.stringify(feature.references || [], null, 2));


      const rawContext = { ...feature };
      delete rawContext.generated_schema;
      delete rawContext.implementation_data;
      contextJson = replaceAll(contextJson, 'raw_json', JSON.stringify(rawContext, null, 2));
      contextJson = replaceAll(contextJson, 'previous_schema', feature.generated_schema || 'None');

      const prompts = feature.automation_prompts || {};
      contextJson = replaceAll(contextJson, 'automation_prompts.ai_ui', prompts.ai_ui || `Interactive JSON Schema for VAPT Workbench.`);
      contextJson = replaceAll(contextJson, 'automation_prompts.ai_check', prompts.ai_check || `PHP verification logic for ${feature.label || 'this feature'}.`);
      contextJson = replaceAll(contextJson, 'automation_prompts.ai_schema', prompts.ai_schema || `Essential schema fields for ${feature.label || 'this feature'}.`);

      // 5. Hyper-Personalization: Synthesize Security Objective & Business Context (v3.13.1)
      const featureSeverity = typeof rawSev === 'object' ? rawSev : { level: rawSev };
      const businessImpact = featureSeverity.business_impact || '';

      const featureDesc = typeof rawDesc === 'object' ? rawDesc : { summary: rawDesc };
      const detailedDesc = featureDesc.detailed || featureDesc.summary || '';
      const attackScenario = rawScenario || featureDesc.attack_scenario || '';

      const securityObjective = `
        - **PRIMARY GOAL**: Remediate the vulnerability identified as **${feature.id || 'N/A'}** (${feature.label || 'Unnamed Feature'}).
        - **SECURITY MANDATE**: You MUST ensure the implementation provides robust protection against **${Array.isArray(feature.risks) ? feature.risks.join(' and ') : (feature.risks || 'identified risks')}**.
        - **VULNERABILITY CONTEXT**: ${detailedDesc || 'No detailed description provided.'}
        - **ATTACK VECTOR RELEVANCE**: This control specifically defeats the scenario where ${attackScenario || 'an attacker attempts to exploit this weakness'}.
      `.trim();

      const operationalContext = `
        - **Business/Operational Risk**: ${businessImpact || 'N/A'}
        - **Global Compliance Anchor**: This feature maps to **${formatValue(rawOwasp) || 'General Security Best Practices'}**.
        - **Performance Constraint**: ${formatValue(perfImpact) || 'Standard implementation.'}
      `.trim();

      const protocolContext = `
        - **Manual Verification Steps**: ${formatValue(rawVerif) || 'N/A'}
        - **Remediation Effort**: ${feature.protection?.remediation_effort || 'N/A'}
        - **Testing Protocol**: ${formatValue(rawMethod) || 'N/A'}
      `.trim();

      // 5. Assemble PRODUCTION READY PROMPT (v3.14.0 - VAPT 125-Risk Aligned)
      const homeUrl = (settings.homeUrl || '').replace(/\/$/, '');
      const currentDomain = (settings.currentDomain || window.location.hostname || 'hermasnet.local').split(':')[0];
      const includeProtocol = feature.include_manual_protocol !== false;
      const includeNotes = feature.include_operational_notes !== false;

      const finalPrompt = `
      --- ROLE & OBJECTIVE ---
      You are the **VAPT Security Expert Agent**. Your mandate is to generate production-ready Interface Schema JSONs for the **${settings.pluginName || 'VAPT Secure'}** workbench. You MUST achieve \u226590% accuracy by following the deterministic instructions below.

      --- THE FOUR PILLARS OF ACCURACY ---
      1. **Schema-First Generation**: ALWAYS use the provided context as ground truth. Never infer component types, default values, or sections.
      2. **Pattern Library Lookup**: Use the provided 'platform_implementations' for enforcement code. Never hallucinate security rules.
      3. **Enforcer Validation**: Verify the platform exists in 'available_platforms' before outputting.
      4. **Self-Check Rubric**: You MUST score your own output against the rubric below. Only output if score \u2265 13/15.

      --- DESIGN CONTEXT (JSON) ---
      ${contextJson}

      --- SECURITY OBJECTIVE ---
      ${securityObjective}

      --- OPERATIONAL & GLOBAL CONTEXT ---
      ${operationalContext}

      --- MANUAL PROTOCOL CONTEXT ---
      ${protocolContext}

      --- AI AGENT INSTRUCTIONS ---
      ${displayInstruct}

      --- REFERENCE CODE ---
      ${referenceCode || 'No specific reference code provided.'}

      --- INSTRUCTIONS & CRITICAL RULES ---
      1. **Output Format**: Provide ONLY a JSON block. No preamble. No conversational filler.
      2. **Fully Qualified URLs**: Use **site_context.home_url** (${homeUrl}) for ALL URLs and endpoints (e.g. ${homeUrl}/wp-cron.php). Every "url" property MUST be an absolute link. No relative paths.
      3. ${isMultiEnv ? '**Multi-Platform Parallel Strategy**: You MUST generate a \`platform_matrix\` including implementations for Apache (.htaccess), Nginx, IIS, Caddy, Cloudflare, and PHP Fallback.' : `**Single Enforcer Strategy**: Target ONLY the **${prioritizedDriver}** driver. Valid: hook, htaccess, wp-config, nginx, fail2ban, cloudflare, iis, caddy.`}
      4. **Naming Conventions**: 
         - Component: Risk{NNN}{TitleCamelCase} (e.g. Risk001WpCronProtection)
         - Handlers: handleRISK{NNN}{EventType}Change (e.g. handleRISK001ToggleChange)
      5. **Absolute Links**: Description fields MUST provide URLs as clean, clickable Markdown links [label](url).
      6. **Key Enforcement**: EVERY control MUST have a unique "key" field.
      7. **Resiliency**: Include \`retry_on_failure: true\` and failure logic in \`test_action\` configurations.
      8. **Safety & Compliance**:
         - Mandate **Rollback Verification** steps to ensure site stability.
         - Include **Dependency Checks** (verifying required server modules).
         - Implement **Rate Limiting** logic for probes to protect high-availability environments.

      ${isMultiEnv ? `--- A+ CLIENT-READY REQUIREMENTS (v3.2) ---
      1. **Versioning**: Schema MUST include \`"schema_version": "3.2.0"\` and \`"schema_grade": "A+"\`.
      2. **Runtime Detection**: Include \`runtime_environment_detection\` cascade (header, php, filesystem, function).
      3. **Platform Matrix**: Implement \`implementations\` for: apache_htaccess, nginx_config, iis_config, caddy_config, cloudflare_edge, php_functions.
      4. **Deployment Profiles**: Define \`client_deployment.profiles\` for: Auto-Detect, Maximum, Conservative, Enterprise.
      5. **Unified Test Suite**: Create a single suite that validates protection across ALL active platforms.
      6. **Client Verification**: Include \`client_verification\` with http-probes and user-friendly messaging.` : `--- ADVANCED CHECKPOINTS (v2.0) ---
      1. **Versioning**: Schema MUST include \`"interface_version": "2.0"\`.
      2. **Test Logic**: \`test_action\` MUST include timeout and retry parameters.
      3. **Conditional Logic**: Controls MUST specify \`prerequisites\` or conflicts where applicable.
      4. **Multi-Environment**: Enforcement MUST define a \`fallback_driver\`.
      5. **Audit Trail**: Include telemetry configuration for implementation events.
      6. **UX Visuals**: Add visual indicators and help resource links to the schema.`}

      --- FULL SELF-CHECK RUBRIC (Score 1-19) ---
      You MUST score exactly 19/19 to deliver.
      ${isMultiEnv ? `1. [x] Schema Version is 3.2.0?
      2. [x] Schema Grade is A+?
      3. [x] platform_matrix.implementations contains >= 6 platforms?
      4. [x] Runtime detection cascade defined for client environments?
      5. [x] Unified test suite includes environment-agnostic validation?
      6. [x] Client deployment profiles (Auto-Detect/Enterprise) defined?
      7. [x] Multi-platform UI badges/indicators enabled?
      8. [x] Enrollment is automatic via cascade strategy?
      9. [x] php_functions defined as the last universal fallback?
      10. [x] Rollback verification included for ALL platforms?
      11. [x] Every URL is FULLY QUALIFIED (absolute link)?
      12. [x] VAPT block markers present in all implementation code?
      13. [x] Retry logic included in test_action?
      14. [x] Rate limiting probes defined?
      15. [x] Timeout parameters set for all probe actions?
      16. [x] Prerequisites defined for complex enforcers?
      17. [x] Component names follow PascalCase?
      18. [x] Telemetry/Audit trail configured?
      19. [x] JSON syntax validated?` : `1. [x] Component IDs match schema exactly?
      2. [x] Enforcement code sourced from library?
      3. [x] Severity colors match global config?
      4. [x] Handler names follow PascalCase conventions?
      5. [x] Target platform listed in available_platforms?
      6. [x] VAPT block markers present in output?
      7. [x] Double-Qualification Guard: No redundant domain prepending?
      8. [x] Every URL in test_action is FULLY QUALIFIED (absolute link)?
      9. [x] Descriptions contain functional Markdown Links for URLs?
      10. [x] No forbidden .htaccess directives used?
      11. [x] RewriteRules placed BEFORE # BEGIN WordPress?
      12. [x] RewriteRules wrapped in <IfModule>?
      13. [x] Version 2.0 marker present?
      14. [x] Fallback driver defined in enforcement?
      15. [x] Retry logic included in test_action?
      16. [x] Prerequisites defined for complex controls?
      17. [x] Telemetry/Audit trail configured?
      18. [x] Visual indicators (shield/icon) included?
      19. [x] JSON syntax validated before output?`}

      --- JSON SKELETON ---
      \`\`\`json
      {
        "interface_version": "${isMultiEnv ? '3.2.0' : '2.0'}",
        "metadata": {
          "risk_id": "${feature.id || 'N/A'}",
          "schema_grade": "${isMultiEnv ? 'A+' : 'Standard'}",
          "severity": "${(typeof feature.severity === 'object' ? feature.severity.level : feature.severity) || 'High'}"
        },
        ${includeProtocol ? '"manual_protocol": { "steps": ["Step 1...", "Step 2..."] },' : ''}
        ${includeNotes ? '"operational_notes": "Summary of risks and benefits...",' : ''}
        "controls": [
          { 
            "type": "toggle", "label": "Enable Protection", "key": "prot_enabled", "default": false, "visual_indicator": "shield"
          },
          { 
            "type": "test_action", "label": "Verify Configuration", "key": "verify_prot", 
            "test_config": { "url": "${homeUrl}/...", "expected_status": 403, "retry_on_failure": true } 
          }
        ],
        ${isMultiEnv ? `"platform_matrix": {
          "runtime_detection": { "detection_cascade": ["header", "php", "filesystem"] },
          "implementations": {
            "apache_htaccess": { "lib_key": "htaccess", "rollback": { "automatic": true } },
            "nginx_config": { "lib_key": "nginx", "rollback": { "automatic": true } },
            "php_functions": { "lib_key": "php_functions", "universal_fallback": true }
          }
        },
        "client_deployment": { "profiles": { "auto_detect": { "deploy_order": ["apache_htaccess", "php_functions"] } } },` : `"enforcement": {
          "driver": "${prioritizedDriver}",
          "fallback_driver": "hook",
          "target": "${prioritizedDriver === 'htaccess' ? 'root' : 'universal'}",
          "rollback_on_disable": true,
          "mappings": { "prot_enabled": "/* Code */" },
          "telemetry": { "log_events": true }
        },`}
        "ui_layout": { "multi_environment_display": ${isMultiEnv ? 'true' : 'false'} }
      }
      \`\`\`


      Feature: ${feature.label || 'Unnamed'} (${feature.id || 'N/A'})
      `;

      // 6. Fully Qualify URLs & Personalize Domain (v3.13.2)
      let qualifiedPrompt = finalPrompt;

      // Transformation A: Replace Domain Placeholders with Fully Qualified Home URL
      const domainPlaceholders = [/https?:\/\/(?:www\.)?(?:domain\.com|yourdomain\.com|example\.com|mysite\.com)/gi, /(?:www\.)?(?:domain\.com|yourdomain\.com|example\.com|mysite\.com)/gi];
      domainPlaceholders.forEach((regex, idx) => {
        // If it was already a full URL placeholder, replace with homeUrl
        // If it was just a domain placeholder, replace with the domain part of homeUrl or homeUrl itself depending on context
        // To be safe and meet "fully URL" requirement, we use homeUrl for the first and domain for the second.
        if (idx === 0) {
          qualifiedPrompt = qualifiedPrompt.replace(regex, homeUrl);
        } else {
          qualifiedPrompt = qualifiedPrompt.replace(regex, currentDomain);
        }
      });

      // Transformation B: Qualify Relative Paths (Common WP/VAPT paths)
      // This looks for paths in quotes or preceded by space to avoid breaking JSON keys
      const relativePaths = [
        /\b\/wp-admin\b/g,
        /\b\/wp-login\.php\b/g,
        /\b\/xmlrpc\.php\b/g,
        /\b\/wp-admin\/admin-ajax\.php\b/g,
        /\b\/wp-cron\.php\b/g,
        /\/\?author=\d+/g,
        /\/\?p=\d+/g
      ];

      relativePaths.forEach(regex => {
        // Only replace if NOT preceded by a protocol colon/slashes (prevents double qualification)
        qualifiedPrompt = qualifiedPrompt.replace(regex, (match, offset, fullText) => {
          const prevChar = fullText.substring(offset - 3, offset);
          if (prevChar === '://' || fullText.substring(offset - 7, offset).includes('http')) {
            return match; // Already qualified
          }
          return homeUrl + match;
        });
      });

      const personalizedPrompt = qualifiedPrompt;

      const copyToClipboard = (text) => {
        const fallbackCopy = (text) => {
          let textArea = document.createElement("textarea");
          textArea.value = text;
          // Ensure it's not visible but exists in DOM
          textArea.style.position = "fixed";
          textArea.style.left = "-9999px";
          textArea.style.top = "0";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          let success = false;
          try {
            success = document.execCommand('copy');
          } catch (err) {
            vaptLog.error('Fallback Copy failed', err);
          }
          document.body.removeChild(textArea);
          return success ? Promise.resolve() : Promise.reject('ExecCommand Failed');
        };

        if (navigator.clipboard && window.isSecureContext) {
          return navigator.clipboard.writeText(text).catch(err => {
            vaptLog.warn('navigator.clipboard failed, trying fallback...', err);
            return fallbackCopy(text);
          });
        }
        return fallbackCopy(text);
      };

      copyToClipboard(personalizedPrompt)
        .then(() => {
          setSaveStatus({ message: __('Design Prompt copied!', 'vaptguard'), type: 'success' });
          setTimeout(() => setSaveStatus(null), 3000);
        })
        .catch(err => {
          vaptLog.error('All copy methods failed', err);
          setSaveStatus({ message: __('Copy failed. Please select and copy manually.', 'vaptguard'), type: 'error' });
          setTimeout(() => setSaveStatus(null), 4000);
        });
    };


    return el(Modal, {
      title: el('div', { className: 'vapt-design-modal-header' }, [
        el('div', { className: 'vapt-flex-row', style: { gap: '10px', alignItems: 'center' } }, [
          el('span', null, sprintf(__('Design Implementation: %s', 'vaptguard'), feature.label)),
        ]),
        // Status Pill
        el('span', {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            marginLeft: '15px',
            padding: '3px 10px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: '600',
            color: '#fff',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            verticalAlign: 'middle',
            background: (() => {
              const s = (feature.status || 'Draft').toLowerCase();
              if (s === 'develop') return '#10b981'; // Green
              if (s === 'test') return '#eab308'; // Yellowish Gold
              if (s === 'release') return '#f97316'; // Orange
              return '#94a3b8'; // Slate 400 (Draft)
            })(),
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
          }
        }, feature.status || 'Draft'),
        el(Button, {
          isDestructive: true,
          isSmall: true,
          onClick: () => setIsRemoveConfirmOpen(true),
          disabled: isSaving || !feature.generated_schema,
          icon: 'trash'
        }, __('Remove Implementation', 'vaptguard'))
      ]),
      onRequestClose: onClose,
      className: 'vapt-design-modal',
      id: 'vapt-design-modal-root'
    }, [
      saveStatus && el('div', {
        id: 'vapt-design-modal-banner',
        className: `vapt - modal - banner is - ${saveStatus.type === 'error' ? 'error' : 'success'} `
      }, [
        el(Icon, { icon: saveStatus.type === 'error' ? 'warning' : 'yes', size: 20 }),
        saveStatus.message
      ]),

      el('form', {
        id: 'vapt-design-modal-form',
        onSubmit: (e) => e.preventDefault(),
        className: 'vapt-design-modal-inner-layout'
      }, [
        el('div', { id: 'vapt-design-modal-left-col' }, [
          (() => {
            const isAPlus = (parsedSchema?.metadata?.schema_grade === 'A+' || parsedSchema?.schema_grade === 'A+');
            return el('div', { id: 'vapt-design-modal-actions', className: 'vapt-flex-row' }, [
              !isAPlus && el(Button, { id: 'vapt-btn-copy-prompt', className: 'vapt-btn-flex-center', isSecondary: true, onClick: copyContext, icon: 'clipboard' }, __('Copy AI Design Prompt', 'vaptguard')),
              el(Button, {
                isDestructive: true,
                icon: 'trash',
                onClick: () => {
                  setConfirmState({
                    message: __('Are you sure you want to reset the schema? This will wash away any changes.', 'vaptguard'),
                    isDestructive: true,
                    onConfirm: () => {
                      setConfirmState(null);
                      onJsonChange(JSON.stringify(MEANINGFUL_DEFAULT, null, 2));
                      setSaveStatus({ message: __('Schema Reset!', 'vaptguard'), type: 'success' });
                      setTimeout(() => setSaveStatus(null), 2000);
                    }
                  });
                }
              }, __('Reset', 'vaptguard'))
            ]);
          })(),

          (() => {
            const isAPlus = (parsedSchema?.metadata?.schema_grade === 'A+' || parsedSchema?.schema_grade === 'A+');
            return el('div', { id: 'vapt-design-modal-toggles', className: 'vapt-flex-col' }, [
              el('div', { className: 'vapt-flex-row', style: { width: '100%', gap: '20px', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0px' } }, [
                el('div', { className: 'vapt-flex-col' }, [
                  el(ToggleControl, {
                    label: __('Add Operational Notes', 'vaptguard'),
                    checked: includeNotes,
                    onChange: setIncludeNotes
                  }),
                  el(ToggleControl, {
                    label: __('Add Manual Verification Notes', 'vaptguard'),
                    checked: includeProtocol,
                    onChange: setIncludeProtocol
                  })
                ]),
                el('div', { style: { paddingTop: '2px' } }, [
                  el(Button, {
                    isSecondary: true,
                    icon: 'update',
                    onClick: () => {
                      if (window.vaptguard_APlusGenerator) {
                        const tempFeature = { ...feature, include_manual_protocol: includeProtocol, include_operational_notes: includeNotes };
                        const updatedSchema = window.vaptguard_APlusGenerator.generate(tempFeature, customizationText);
                        onJsonChange(JSON.stringify(updatedSchema, null, 2));
                        setSaveStatus({ message: __('Schema Updated!', 'vaptguard'), type: 'success' });
                        setTimeout(() => setSaveStatus(null), 2000);
                      }
                    }
                  }, __('Update Schema', 'vaptguard'))
                ])
              ]),
              !isAPlus && el('div', { className: 'vapt-flex-row', style: { gap: '20px' } }, [
                el(ToggleControl, {
                  label: __('Enable A+ Client-Ready Multi-Env Mode (v3.2)', 'vaptguard'),
                  checked: isMultiEnv,
                  onChange: setIsMultiEnv,
                  help: __('Mandates A+ runtime capability detection and client-ready fallback orchestration.', 'vaptguard')
                }),
                el(ToggleControl, {
                  label: __('Enable A+ Adaptive Deployment (v4.0)', 'vaptguard'),
                  checked: isAdaptiveDeployment,
                  onChange: setIsAdaptiveDeployment,
                  help: __('Automatically adapts enforcement to server environment (Apache, Nginx, PHP) with universal fallback.', 'vaptguard')
                })
              ])
            ]);
          })(),

          el('div', {
            id: 'vapt-design-modal-schema-editor',
            className: 'vapt-flex-col',
            onMouseEnter: () => setIsHoveringSchema(true),
            onMouseLeave: () => setIsHoveringSchema(false)
          }, [
            el('label', { id: 'vapt-schema-editor-label', className: 'vapt-label-uppercase' }, __('A+ Adaptive Script (Source JSON)', 'vaptguard')),
            el('div', { id: 'vapt-schema-editor-hint', className: 'vapt-text-hint' }, __('Hover and Ctrl+V to replace content.', 'vaptguard')),
            el('textarea', {
              id: 'vapt-schema-textarea',
              className: 'vapt-textarea-code',
              value: schemaText,
              onChange: (e) => onJsonChange(e.target.value),
              style: {
                background: isHoveringSchema ? '#f0fdf4' : '#fcfcfc',
                minHeight: '300px'
              }
            }),
            el('div', { id: 'vapt-customization-textarea-wrap', className: 'vapt-flex-col', style: { marginTop: '15px' } }, [
              el('label', { className: 'vapt-label-uppercase' }, __('Workbench Customization Guidance', 'vaptguard')),
              el('textarea', {
                id: 'vapt-customization-textarea',
                className: 'vapt-textarea-custom',
                placeholder: __('Enter custom instructions for A+ Adaptive Logic generation...', 'vaptguard'),
                value: customizationText,
                onChange: (e) => setCustomizationText(e.target.value),
                style: {
                  minHeight: '120px',
                  background: '#fffbf0',
                  border: '1px solid #f97316'
                }
              })
            ])
          ]),

          (() => {
            const isAPlus = (parsedSchema?.metadata?.schema_grade === 'A+' || parsedSchema?.schema_grade === 'A+');
            if (isAPlus) return null;

            let displayInstruct = feature.dev_instruct || feature.devInstruct || feature.ai_agent_instructions || '';

            // FALLBACK: If dev_instruct is missing, try to extract from the generated schema string
            if (!displayInstruct && feature.generated_schema) {
              try {
                const schema = typeof feature.generated_schema === 'string' ? JSON.parse(feature.generated_schema) : feature.generated_schema;
                if (schema && schema.instruction) {
                  displayInstruct = schema.instruction;
                }
              } catch (e) {
                vaptLog.warn('Failed to extract fallback instructions from schema', e);
              }
            }

            // Always show if we have something or a placeholder
            if (!displayInstruct) {
              displayInstruct = __('No specific development guidance available for this feature transition.', 'vaptguard');
            }

            return el('div', { id: 'vapt-design-modal-guidance', className: 'vapt-flex-col', style: { marginBottom: '15px' } }, [
              el('label', { className: 'vapt-label-uppercase', style: { color: '#2271b1' } }, __('AI Development Guidance')),
              el('div', {
                className: 'vapt-guidance-box',
                style: {
                  background: '#f0f6fb',
                  borderLeft: '4px solid #2271b1',
                  padding: '12px',
                  fontSize: '12px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit'
                }
              }, (() => {
                // 🔗 Linkify URLs for easier verification (v3.13.2)
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                if (!displayInstruct || typeof displayInstruct !== 'string') return displayInstruct;
                const parts = displayInstruct.split(urlRegex);
                return parts.map((part, i) =>
                  part.match(urlRegex)
                    ? el('a', { key: i, href: part, target: '_blank', rel: 'noopener noreferrer', style: { color: '#2271b1', textDecoration: 'underline' } }, part)
                    : part
                );
              })())
            ]);
          })(),
        ]),

        el('div', { id: 'vapt-design-modal-right-col' }, [
          el('div', { className: 'vapt-design-modal-preview-header' }, [
            el('div', { className: 'vapt-flex-row', style: { gap: '8px' } }, [
              el(Icon, { icon: 'visibility', size: 16 }),
              el('strong', { className: 'vapt-preview-title' }, __('Preview Panel: Effective Protections', 'vaptguard'))
            ]),
            el('div', { className: 'vapt-flex-row', style: { gap: '10px' } }, [
              el(Button, {
                isPrimary: true,
                className: 'vapt-btn-deploy-aplus',
                onClick: handleSave,
                isBusy: isSaving,
                icon: 'cloud-upload',
                style: { background: '#10b981', borderColor: '#059669', fontWeight: 'bold' }
              }, __('Deploy', 'vaptguard')),
              el(Button, { isSecondary: true, isSmall: true, onClick: onClose }, __('Cancel', 'vaptguard')),
              el(Button, { isSecondary: true, isSmall: true, onClick: handleSave, isBusy: isSaving }, isAdaptiveDeployment ? __('Deploy', 'vaptguard') : __('Implement', 'vaptguard'))
            ])
          ]),
          el('div', { className: 'vapt-design-modal-preview-body' }, [
            (() => {
              const schema = parsedSchema || { controls: [] };
              return el('div', { id: 'vapt-design-modal-preview-stack', className: 'vapt-flex-col' }, [
                el('div', { className: 'vapt-card-box' }, [
                  el('h4', { className: 'vapt-card-title' }, __('Functional Implementation')),
                  GeneratedInterface
                    ? el(GeneratedInterface, {
                      feature: { ...feature, generated_schema: schema, implementation_data: localImplData },
                      onUpdate: (newData) => setLocalImplData(newData)
                    })
                    : el('p', null, __('Loading Preview Interface...', 'vaptguard'))
                ])
              ]);
            })()
          ])
        ])
      ]),

      isRemoveConfirmOpen && el(Modal, {
        title: __('Confirm Removal', 'vaptguard'),
        onRequestClose: () => setIsRemoveConfirmOpen(false),
        style: { maxWidth: '450px' }
      }, [
        el('div', { style: { padding: '25px', textAlign: 'center' } }, [
          el(Icon, { icon: 'warning', size: 42, style: { color: '#dc2626', marginBottom: '15px' } }),
          el('h3', null, __('Remove Implementation?', 'vaptguard')),
          el('p', { style: { fontSize: '13px', color: '#6b7280' } }, __('Are you sure? This cannot be undone.', 'vaptguard')),
          el('div', { style: { display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px' } }, [
            el(Button, { isSecondary: true, onClick: () => setIsRemoveConfirmOpen(false) }, __('Cancel', 'vaptguard')),
            el(Button, { isDestructive: true, onClick: handleRemoveConfirm, isBusy: isSaving }, __('Yes, Remove It', 'vaptguard'))
          ])
        ])
      ]),

      alertState && el(vaptguard_AlertModal, {
        isOpen: true,
        message: alertState.message,
        type: alertState.type,
        onClose: () => setAlertState(null)
      }),
      confirmState && el(vaptguard_ConfirmModal, {
        isOpen: true,
        message: confirmState.message,
        isDestructive: confirmState.isDestructive,
        onConfirm: confirmState.onConfirm,
        onCancel: () => setConfirmState(null)
      })
    ]);
  };

  // Prompt Configuration Modal
  const PromptConfigModal = ({ isOpen, onClose, feature, designPromptConfig, setDesignPromptConfig, selectedFile }) => {
    const [promptText, setPromptText] = useState(
      designPromptConfig ? (typeof designPromptConfig === 'string' ? designPromptConfig : JSON.stringify(designPromptConfig, null, 2)) : ''
    );

    const handleSave = () => {
      setDesignPromptConfig(promptText);
      onClose();
    };

    return el(Modal, {
      title: __('AI Design Prompt Configuration', 'vaptguard'),
      onRequestClose: onClose,
      className: 'vapt-prompt-config-modal'
    }, [
      el('p', null, __('Customize the instructions sent to the AI for interface generation.', 'vaptguard')),
      el(TextareaControl, {
        label: __('System Prompt / Context Template', 'vaptguard'),
        value: promptText,
        onChange: setPromptText,
        rows: 20,
        style: { fontFamily: 'monospace', fontSize: '12px' }
      }),
      el('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' } }, [
        el(Button, { isSecondary: true, onClick: onClose }, __('Cancel', 'vaptguard')),
        el(Button, { isPrimary: true, onClick: handleSave }, __('Save Configuration', 'vaptguard'))
      ])
    ]);
  };

  // Field Mapping Modal Component
  const FieldMappingModal = ({ isOpen, onClose, fieldMapping, setFieldMapping, allKeys }) => {
    // Helper to generate SelectControl for a mapping field
    const renderMappingSelect = (label, key) => {
      return el(SelectControl, {
        id: `vapt-mapping-select-${key}`,
        label: label,
        value: fieldMapping[key] || '',
        options: [{ label: __('--- Select Source Field ---', 'vaptguard'), value: '' }, ...allKeys.map(k => ({ label: k, value: k }))],
        onChange: (val) => setFieldMapping({ ...fieldMapping, [key]: val }),
        style: { marginBottom: '15px' }
      });
    };

    const handleAutoMap = () => {
      const newMapping = { ...fieldMapping };
      let mappedCount = 0;
      const mappingDetails = [];

      // Enhanced matching with scoring - improved to prioritize nested keys and target field names
      const findBestMatch = (keywords, targetFieldName = '') => {
        const matches = [];

        allKeys.forEach(field => {
          const fieldLower = field.toLowerCase();
          let bestScore = 0;
          let bestKeyword = '';

          keywords.forEach(keyword => {
            const keywordLower = keyword.toLowerCase();
            let score = 0;

            // Bonus: keyword contains target field name (e.g., "verification_steps" contains "verification")
            const targetInKeyword = targetFieldName && keywordLower.includes(targetFieldName.toLowerCase());
            const keywordInTarget = targetFieldName && targetFieldName.toLowerCase().includes(keywordLower);

            // Exact match (highest priority)
            if (fieldLower === keywordLower) {
              score = 100;
              // Extra bonus if keyword contains target field name
              if (targetInKeyword) score += 20;
            }
            // Field ends with .keyword (nested match) - e.g., "testing.verification_steps" ends with ".verification_steps"
            else if (fieldLower.endsWith('.' + keywordLower)) {
              score = 95;
              if (targetInKeyword) score += 15;
            }
            // Field starts with keyword. - e.g., "verification_steps.testing" starts with "verification_steps."
            else if (fieldLower.startsWith(keywordLower + '.')) {
              score = 90;
              if (targetInKeyword) score += 15;
            }
            // Field contains keyword as whole word with dots (nested structure)
            else if (fieldLower.includes('.' + keywordLower + '.')) {
              score = 85;
              if (targetInKeyword) score += 10;
            }
            // Field contains keyword as whole word with underscores
            else if (fieldLower.includes('_' + keywordLower + '_')) {
              score = 80;
              if (targetInKeyword) score += 10;
            }
            // Field contains keyword (partial match)
            else if (fieldLower.includes(keywordLower)) {
              // Penalize longer field names for partial matches
              const lengthPenalty = Math.min(20, (fieldLower.length - keywordLower.length) * 2);
              score = 70 - lengthPenalty;
              if (targetInKeyword) score += 10;
            }
            // Levenshtein distance for fuzzy matching (fallback)
            else {
              // Simple similarity check
              const similarity = keywordLower.split('').filter(c => fieldLower.includes(c)).length / keywordLower.length;
              if (similarity > 0.7) {
                score = Math.floor(similarity * 60);
                if (targetInKeyword) score += 5;
              }
            }

            // Extra bonus for exact target field name match
            if (targetFieldName && fieldLower === targetFieldName.toLowerCase()) {
              score += 25;
            }

            // Special bonus for nested keys that match the target field structure
            if (targetFieldName) {
              // Bonus for field containing target field name as part of nested structure
              if (fieldLower.includes('.' + targetFieldName.toLowerCase() + '.')) {
                score += 15;
              }
              // Bonus for field ending with target field name
              if (fieldLower.endsWith('.' + targetFieldName.toLowerCase())) {
                score += 20;
              }
              // Bonus for field starting with target field name
              if (fieldLower.startsWith(targetFieldName.toLowerCase() + '.')) {
                score += 20;
              }

              // SPECIAL HANDLING FOR SPECIFIC FIELDS
              // For operational_notes, prioritize keys ending with ".context"
              if (targetFieldName === 'operational_notes' && fieldLower.endsWith('.context')) {
                score += 30; // Extra bonus for context fields
              }
              // For verification_steps, prioritize keys containing "verification_steps"
              if (targetFieldName === 'verification_steps' && fieldLower.includes('verification_steps')) {
                score += 25; // Extra bonus for exact verification_steps match
              }
              // For verification_steps, also prioritize keys ending with ".steps"
              if (targetFieldName === 'verification_steps' && fieldLower.endsWith('.steps')) {
                score += 20; // Bonus for steps fields
              }
            }

            if (score > bestScore) {
              bestScore = score;
              bestKeyword = keyword;
            }
          });

          if (bestScore > 40) {
            matches.push({
              field,
              score: bestScore,
              keyword: bestKeyword
            });
          }
        });

        // Sort by score descending, then by field length (shorter is better)
        matches.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.field.length - b.field.length;
        });

        return matches.length > 0 ? matches[0].field : '';
      };

      const autoMapField = (key, keywords, fieldType = 'any') => {
        if (!newMapping[key]) {
          const match = findBestMatch(keywords, key);
          if (match) {
            newMapping[key] = match;
            mappedCount++;
            mappingDetails.push({
              target: key,
              source: match,
              keywords: keywords.slice(0, 3) // Show first 3 keywords for context
            });
          }
        }
      };

      // Core Context Fields
      autoMapField('description', ['summary', 'description', 'desc', 'overview', 'details', 'info', 'text', 'content', 'explanation', 'definition']);
      autoMapField('severity', ['severity', 'level', 'risk_level', 'risk.level', 'priority', 'criticality', 'impact', 'risk', 'severity.level', 'severity_level']);

      // UI Schema Fields
      autoMapField('ui_layout', ['ui_layout', 'ui-layout', 'uiLayout', 'layout', 'ui', 'interface', 'design', 'ui.layout', 'ui_layout_schema', 'interface_layout', 'ui_design', 'structure', 'arrangement', 'layout.ui', 'ui_schema', 'interface_schema', 'design_layout', 'visual_layout', 'page_layout', 'template_layout']);
      autoMapField('components', ['components', 'ui_components', 'ui-components', 'uiComponents', 'ui.components', 'fields', 'elements', 'controls', 'widgets', 'parts', 'ui_elements', 'component_list', 'ui_elements_list', 'fields_list', 'controls_list', 'widgets_list', 'ui_parts', 'interface_components', 'design_components', 'visual_components', 'ui_controls']);
      autoMapField('actions', ['actions', 'ui_actions', 'ui-actions', 'uiActions', 'ui.actions', 'buttons', 'action', 'operations', 'functions', 'interactions', 'handlers', 'action_list', 'buttons_list', 'operations_list', 'functions_list', 'ui_buttons', 'interface_actions', 'design_actions', 'visual_actions', 'user_actions', 'click_actions', 'event_handlers']);

      // Platform & Enforcement
      autoMapField('available_platforms', ['available_platforms', 'platforms', 'platform_list', 'supported_platforms', 'platform', 'platforms.available', 'platforms_list', 'compatible_platforms']);
      autoMapField('platform_implementations', ['platform_implementations', 'implementations', 'enforcer_map', 'implementation', 'enforcer', 'platform.implementations', 'enforcement', 'rules', 'configurations']);

      // Additional Context - Prioritize nested keys and exact matches
      autoMapField('operational_notes', [
        'operational_notes.context',  // Highest priority - exact nested key
        'context.operational_notes',  // Alternative nested structure
        'operational_notes',          // Exact field name
        'operational_context',
        'operation_context',
        'context',
        'operation_notes',
        'operation_details',
        'notes',
        'summary',
        'remarks',
        'comments',
        'guidance',
        'instructions',
        'documentation',
        'background',
        'environment',
        'contextual',
        'operationalContext',
        'operational-context',
        'op_context',
        'op_notes',
        'opnotes',
        'opcontext',
        'notes.operational',
        'description.context',
        'context.description',
        'info',
        'additional_info',
        'additional_info.context',
        'context.additional',
        'notes.context',
        'context.notes',
        'operational.context'
      ]);

      autoMapField('verification_steps', [
        'testing.verification_steps',  // Highest priority - exact nested key
        'verification.steps',          // Alternative nested structure
        'verification_steps',          // Exact field name
        'manual_verification',
        'steps',
        'test_steps',
        'testing_steps',
        'validation_steps',
        'test_method',
        'verification',
        'testing',
        'validation',
        'checks',
        'procedures',
        'manual_testing',
        'test_procedure',
        'verificationSteps',
        'verification-steps',
        'test.method',
        'test.methodology',
        'test.procedure',
        'steps.verification',
        'manual_test',
        'manual.test',
        'test.manual',
        'test_manual',
        'checklist',
        'test_checklist',
        'testing.checklist',
        'validation.checklist',
        'testing.verification',
        'verification.testing',
        'test.verification',
        'verification.test'
        // Removed: 'owasp' - causes incorrect matches
      ]);

      // Risk Identification & Compliance
      autoMapField('risk_id', ['risk_id', 'id', 'risk identifier', 'risk id', 'identifier', 'risk.identifier', 'risk.id', 'unique_id', 'uid', 'key']);
      autoMapField('title', ['title', 'name', 'risk title', 'risk name', 'heading', 'label', 'caption', 'risk.title', 'risk_name', 'risk_title']);
      autoMapField('category', ['category', 'type', 'risk category', 'classification', 'group', 'family', 'risk.category', 'risk_type', 'risk_category']);
      autoMapField('owasp_cwe', ['owasp.cwe', 'cwe', 'cwe id', 'cwe identifier', 'cwe_id', 'cwe_number', 'cwe-id', 'cwe.id', 'weakness', 'vulnerability']);
      autoMapField('owasp_top_10_2025', ['owasp.owasp_top_10_2025', 'owasp top 10', 'owasp 2025', 'owasp_top_10_2025', 'owasp', 'owasp_top10', 'owasp.top10', 'owasp_top_10', 'top10', 'top_10']);

      // Verification fields
      autoMapField('verification_command', ['verification.command', 'verification_command', 'verification command', 'test command', 'verification', 'command', 'test.command', 'test_command', 'cli', 'terminal', 'shell']);
      autoMapField('verification_expected', ['verification.expected', 'verification_expected', 'expected output', 'test result', 'expected', 'verification', 'output', 'result', 'expected_result', 'expected.output', 'test.expected']);

      setFieldMapping(newMapping);

      // Enhanced feedback with details
      if (mappedCount === 0) {
        alert(__('No new matching fields found.', 'vaptguard'));
      } else {
        // Create detailed message
        let message = sprintf(__('Auto-mapped %d new fields:\n\n', 'vaptguard'), mappedCount);
        mappingDetails.forEach((detail, index) => {
          message += sprintf(__('%d. %s → %s\n', 'vaptguard'),
            index + 1,
            detail.target,
            detail.source
          );
        });
        message += '\n' + __('Review the mappings in the modal.', 'vaptguard');
        alert(message);

        // Also log to console for debugging
        if (VAPT_DEBUG) {
          console.log('[VAPTGuard] Auto-map details:', mappingDetails);
        }
      }
    };

    const handleReset = () => {
      if (confirm(__('Are you sure you want to clear all field mappings?', 'vaptguard'))) {
        setFieldMapping({});
      }
    };

    return el(Modal, {
      title: null,
      onRequestClose: onClose,
      className: 'vapt-mapping-modal no-header-modal',
      style: {
        width: '600px',
        height: '80vh',
        maxWidth: '90vw',
        maxHeight: '900px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: 0
      }
    }, [
      // Direct CSS injection to bypass WP Modal scaffolding
      el('style', null, `
        .no-header-modal .components-modal__header {
          display: none !important;
        }
        .no-header-modal .components-modal__content {
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
        }
        /* Refined scrollbar - High contrast and cross-browser support */
        .vapt-mapping-scroll-body {
          scrollbar-width: thin;
          scrollbar-color: #949494 #f1f1f1; /* Firefox: thumb, track */
        }
        .vapt-mapping-scroll-body::-webkit-scrollbar {
          width: 10px;
        }
        .vapt-mapping-scroll-body::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        .vapt-mapping-scroll-body::-webkit-scrollbar-thumb {
          background: #949494; /* Darker grey for visibility */
          border-radius: 5px;
          border: 2px solid #f1f1f1;
        }
        .vapt-mapping-scroll-body::-webkit-scrollbar-thumb:hover {
          background: #787878;
        }
      `),

      // Container
      el('div', {
        id: 'vapt-mapping-modal-container',
        style: {
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          overflow: 'hidden',
          position: 'relative',
          background: '#fff'
        }
      }, [

        // Final Sticky Header (Actions + Title)
        el('div', {
          id: 'vapt-mapping-modal-header',
          style: {
            padding: '18px 25px',
            borderBottom: '1px solid #dcdcde',
            background: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flex: '0 0 auto',
            zIndex: 100
          }
        }, [
          el('div', { style: { flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '20px' } }, [
            el('h2', { style: { margin: '0', fontSize: '18px', fontWeight: '600', color: '#1d2327', whiteSpace: 'nowrap' } }, __('Mapping Configuration', 'vaptguard')),
            el('p', { style: { margin: '0', fontSize: '12px', color: '#646970', lineHeight: '1.4', whiteSpace: 'nowrap' } },
              __('Map JSON fields for context-aware prompts.', 'vaptguard')
            ),
            // Total Fields Count Display
            el('div', {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 6px',
                fontSize: '11px',
                fontWeight: '600',
                color: '#1e3a8a',
                background: '#f0f6fb',
                border: '1px solid #c8d7e1',
                borderRadius: '4px',
                height: '22px',
                whiteSpace: 'nowrap',
                marginTop: '4px',
                width: 'fit-content'
              },
              title: __('Total number of mapping fields in the modal', 'vaptguard')
            }, sprintf(__('Total Fields: %d', 'vaptguard'), 16))
          ]),
          el('div', { id: 'vapt-mapping-modal-actions', style: { display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 } }, [
            el(Button, { id: 'vapt-button-automap', isSecondary: true, onClick: handleAutoMap, style: { height: '32px' } }, __('Auto Map', 'vaptguard')),
            el(Button, { id: 'vapt-button-reset', isDestructive: true, isSecondary: true, onClick: handleReset, style: { height: '32px' } }, __('Reset', 'vaptguard')),
            el(Button, { id: 'vapt-button-cancel', isTertiary: true, onClick: onClose, style: { height: '32px' } }, __('Cancel', 'vaptguard')),
            el(Button, { id: 'vapt-button-done', isPrimary: true, onClick: onClose, style: { height: '32px' } }, __('Done', 'vaptguard'))
          ])
        ]),

        // Content - Fixed scrolling with min-height constraint
        el('div', {
          id: 'vapt-mapping-modal-body',
          className: 'vapt-mapping-scroll-body',
          style: {
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: '25px',
            background: '#fcfcfc',
            position: 'relative',
            maxHeight: '590px',
            // minHeight: 0 // Allows flex child to shrink below its content height
          }
        }, [
          el('div', { style: { display: 'flex', flexDirection: 'column', gap: '0' } }, [

            // ── SECTION 1: Core Context ──────────────────────────────────────
            el('h3', { id: 'vapt-mapping-section-core', style: { fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#8c8f94', borderBottom: '1px solid #dcdcde', paddingBottom: '8px', marginBottom: '15px', marginTop: '0', letterSpacing: '0.5px' } }, __('Core Context Fields')),
            renderMappingSelect(__('Description / Summary', 'vaptguard'), 'description'),
            renderMappingSelect(__('Severity Level', 'vaptguard'), 'severity'),

            // ── SECTION 2: UI Schema Fields ──────────────────────────────────
            el('h3', { id: 'vapt-mapping-section-ui', style: { fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#8c8f94', borderBottom: '1px solid #dcdcde', paddingBottom: '8px', marginBottom: '15px', marginTop: '20px', letterSpacing: '0.5px' } }, __('UI Schema Parameters')),
            el('p', { style: { margin: '0 0 12px 0', fontSize: '12px', color: '#646970', lineHeight: '1.5' } },
              __('Fields required for generating >95% accurate interactive UI schema.', 'vaptguard')
            ),
            renderMappingSelect(__('UI Layout Object', 'vaptguard'), 'ui_layout'),
            renderMappingSelect(__('Components Array', 'vaptguard'), 'components'),
            renderMappingSelect(__('Actions Array', 'vaptguard'), 'actions'),

            // ── SECTION 3: Platform & Enforcement ────────────────────────────
            el('h3', { id: 'vapt-mapping-section-platform', style: { fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#8c8f94', borderBottom: '1px solid #dcdcde', paddingBottom: '8px', marginBottom: '15px', marginTop: '20px', letterSpacing: '0.5px' } }, __('Platform & Enforcement')),
            el('p', { style: { margin: '0 0 12px 0', fontSize: '12px', color: '#646970', lineHeight: '1.5' } },
              __('Controls which platform list and implementations are injected into the AI prompt.', 'vaptguard')
            ),
            renderMappingSelect(__('Available Platforms (array)', 'vaptguard'), 'available_platforms'),
            renderMappingSelect(__('Platform Implementations (object)', 'vaptguard'), 'platform_implementations'),

            // ── SECTION 4: Additional Context ────────────────────────────────
            el('h3', { id: 'vapt-mapping-section-additional', style: { fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#8c8f94', borderBottom: '1px solid #dcdcde', paddingBottom: '8px', marginBottom: '15px', marginTop: '20px', letterSpacing: '0.5px' } }, __('Additional Context')),
            el('p', { style: { margin: '0 0 12px 0', fontSize: '12px', color: '#646970', lineHeight: '1.5' } },
              __('Map specific fields for operational notes and manual verification steps.', 'vaptguard')
            ),
            renderMappingSelect(__('Operational Context', 'vaptguard'), 'operational_notes'),
            renderMappingSelect(__('Verification Steps', 'vaptguard'), 'verification_steps'),
            renderMappingSelect(__('Verification Command', 'vaptguard'), 'verification_command'),
            renderMappingSelect(__('Verification Expected', 'vaptguard'), 'verification_expected'),

            // ── SECTION 5: Risk Identification & Compliance ────────────────────
            el('h3', { id: 'vapt-mapping-section-identification', style: { fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#8c8f94', borderBottom: '1px solid #dcdcde', paddingBottom: '8px', marginBottom: '15px', marginTop: '20px', letterSpacing: '0.5px' } }, __('Risk Identification & Compliance')),
            el('p', { style: { margin: '0 0 12px 0', fontSize: '12px', color: '#646970', lineHeight: '1.5' } },
              __('Map risk identification and OWASP compliance fields for enhanced Design Implementation modal.', 'vaptguard')
            ),
            renderMappingSelect(__('Risk ID', 'vaptguard'), 'risk_id'),
            renderMappingSelect(__('Title', 'vaptguard'), 'title'),
            renderMappingSelect(__('Category', 'vaptguard'), 'category'),
            renderMappingSelect(__('OWASP CWE', 'vaptguard'), 'owasp_cwe'),
            renderMappingSelect(__('OWASP Top 10 2025', 'vaptguard'), 'owasp_top_10_2025'),
          ])
        ])
      ])
    ]);
  };

  // Transition Note Modal Component
  const TransitionNoteModal = ({ transitioning, onConfirm, onCancel }) => {
    const [formValues, setFormValues] = useState({
      note: transitioning.note || '',
      dev_instruct: transitioning.dev_instruct || '',
      wireframeUrl: transitioning.wireframeUrl || ''
    });
    const [modalSaveStatus, setModalSaveStatus] = useState(null);

    return el(Modal, {
      title: sprintf(__('Transition to %s', 'vaptguard'), transitioning.nextStatus),
      onRequestClose: onCancel,
      className: 'vapt-transition-modal',
      style: {
        width: '600px',
        maxWidth: '95%',
        maxHeight: '800px',
        overflow: 'hidden'
      }
    }, [
      el('div', {
        style: { height: '100%', display: 'flex', flexDirection: 'column' },
        onPaste: (e) => {
          if (transitioning.nextStatus !== 'Develop') return;
          const items = (e.clipboardData || e.originalEvent.clipboardData).items;
          for (let index in items) {
            const item = items[index];
            if (item.kind === 'file' && item.type.indexOf('image/') !== -1) {
              const blob = item.getAsFile();
              setModalSaveStatus({ message: __('Uploading pasted image...', 'vaptguard'), type: 'info' });

              const formData = new FormData();
              formData.append('file', blob);
              formData.append('title', 'Pasted Wireframe - ' + transitioning.key);

              wp.apiFetch({
                path: 'vaptguard/v1/upload-media',
                method: 'POST',
                body: formData
              }).then(res => {
                setFormValues({ ...formValues, wireframeUrl: res.url });
                setModalSaveStatus({ message: __('Image Uploaded', 'vaptguard'), type: 'success' });
              }).catch(err => {
                setModalSaveStatus({ message: __('Paste failed', 'vaptguard'), type: 'error' });
              });
            }
          }
        }
      }, [
        el('div', { style: { flexGrow: 1, paddingBottom: '10px' } }, [
          el('p', { style: { fontWeight: '600', marginBottom: '10px' } }, sprintf(__('Moving "%s" to %s.', 'vaptguard'), transitioning.key, transitioning.nextStatus)),

          el(TextareaControl, {
            label: __('Internal Transition Note', 'vaptguard'),
            help: __('Reason for status change, logged in history.', 'vaptguard'),
            value: formValues.note,
            onChange: (val) => setFormValues({ ...formValues, note: val }),
          }),

          transitioning.nextStatus === 'Develop' && el(Fragment, null, [
            el(TextareaControl, {
              label: __('Development Instructions (AI Guidance)', 'vaptguard'),
              help: __('AI-ready brief for workbench generation (VAPTSchema patterns).', 'vaptguard'),
              value: formValues.dev_instruct,
              onChange: (val) => setFormValues({ ...formValues, dev_instruct: val }),
            }),
            el(TextControl, {
              label: __('Wireframe / Design URL', 'vaptguard'),
              value: formValues.wireframeUrl,
              onChange: (val) => setFormValues({ ...formValues, wireframeUrl: val }),
              help: __('Paste image from clipboard directly into this modal.', 'vaptguard')
            }),
            modalSaveStatus && el(Notice, {
              status: modalSaveStatus.type,
              isDismissible: false
            }, modalSaveStatus.message)
          ])
        ]),

        el('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '15px', borderTop: '1px solid #ddd' } }, [
          el(Button, { isSecondary: true, onClick: onCancel }, __('Cancel', 'vaptguard')),
          el(Button, {
            isPrimary: true,
            onClick: () => onConfirm(formValues)
          }, sprintf(__('Confirm to %s', 'vaptguard'), transitioning.nextStatus))
        ])
      ])
    ]);
  };

  // Batch Revert Modal Component (v1.9.2)
  const BatchRevertModal = ({ isOpen, previewData, isLoading, isExecuting, includeBroken, onToggleIncludeBroken, includeRelease, onToggleIncludeRelease, onRefresh, onConfirm, onCancel }) => {
    if (!isOpen) return null;

    const count = previewData?.count || 0;
    const brokenCount = previewData?.broken_count || 0;
    const developCount = previewData?.develop_count || 0;
    const releaseCount = previewData?.release_count || 0;
    const includedBrokenCount = previewData?.included_broken_count || 0;
    const includedReleaseCount = previewData?.included_release_count || 0;
    const features = previewData?.features || [];
    const totalHistory = previewData?.total_history_records || 0;
    const totalSchema = previewData?.total_with_schema || 0;
    const totalImpl = previewData?.total_with_impl || 0;
    const totalEnforced = previewData?.total_enforced || 0;

    return el(Modal, {
      title: __('Batch Revert to Draft - Preview', 'vaptguard'),
      onRequestClose: onCancel,
      className: 'vapt-batch-revert-modal',
      style: { width: '650px', maxWidth: '95vw' }
    }, [
      // Condition 1: Cold start (No data and loading)
      !previewData && isLoading ?
        el('div', { style: { padding: '40px', textAlign: 'center' } }, [
          el(Spinner, null),
          el('p', { style: { marginTop: '10px' } }, __('Analyzing features...', 'vaptguard'))
        ]) :
        [
          // Control Toggles (Always visible if counts exist)
          brokenCount > 0 && el('div', {
            key: 'toggle-broken',
            style: { background: '#f0f6fc', padding: '12px', borderRadius: '4px', marginBottom: '15px', border: '1px solid #2271b1' }
          }, [
            el(ToggleControl, {
              label: sprintf(__('Include %d broken feature(s) (Draft status with history records)', 'vaptguard'), brokenCount),
              checked: includeBroken,
              onChange: (val) => onToggleIncludeBroken(val),
              disabled: isExecuting || isLoading
            }),
            el('p', {
              style: { margin: '5px 0 0 0', fontSize: '11px', color: '#646970', fontStyle: 'italic' }
            }, __('Broken features are in Draft status but have leftover history records from incomplete transitions.', 'vaptguard'))
          ]),

          releaseCount > 0 && el('div', {
            key: 'toggle-release',
            style: { background: '#f0f9f0', padding: '12px', borderRadius: '4px', marginBottom: '15px', border: '1px solid #00a32a' }
          }, [
            el(ToggleControl, {
              label: sprintf(__('Include %d Release feature(s)', 'vaptguard'), releaseCount),
              checked: includeRelease,
              onChange: (val) => onToggleIncludeRelease(val),
              disabled: isExecuting || isLoading
            }),
            el('p', {
              style: { margin: '5px 0 0 0', fontSize: '11px', color: '#646970', fontStyle: 'italic' }
            }, __('Release features are currently active in production. Reverting them will disable enforcement.', 'vaptguard'))
          ]),

          // Dynamic Preview Area
          el('div', {
            key: 'dynamic-content',
            style: { position: 'relative', opacity: isLoading ? 0.6 : 1, transition: 'opacity 0.2s' }
          }, [
            // Overlay Spinner for Ajax refresh
            isLoading && previewData && el('div', {
              style: {
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
                background: 'rgba(255,255,255,0.7)',
                padding: '10px',
                borderRadius: '50%'
              }
            }, el(Spinner)),

            count === 0 ?
              el('div', { key: 'no-features', style: { padding: '20px', textAlign: 'center' } }, [
                el('p', { style: { fontSize: '16px', color: '#646970' } },
                  __('✓ No features in selected statuses to revert.', 'vaptguard'))
              ]) :
              [
                // Summary Section
                el('div', {
                  key: 'summary',
                  style: { background: '#f6f7f7', padding: '15px', borderRadius: '4px', marginBottom: '15px' }
                }, [
                  el('h3', {
                    style: { margin: '0 0 10px 0', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#1e1e1e' }
                  }, __('Summary of Changes', 'vaptguard')),
                  el('div', {
                    style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }
                  }, [
                    el('div', null, [
                      el('strong', null, developCount),
                      __(' Develop features', 'vaptguard'),
                      includeBroken && includedBrokenCount > 0 && el('span', { style: { color: '#856404' } }, sprintf(__(' + %d broken', 'vaptguard'), includedBrokenCount)),
                      includeRelease && includedReleaseCount > 0 && el('span', { style: { color: '#d63638' } }, sprintf(__(' + %d release', 'vaptguard'), includedReleaseCount))
                    ]),
                    el('div', null, [el('strong', { style: { color: '#d63638' } }, totalHistory), __(' history records will be deleted', 'vaptguard')]),
                    el('div', null, [el('strong', { style: { color: '#d63638' } }, totalSchema), __(' generated schemas will be cleared', 'vaptguard')]),
                    el('div', null, [el('strong', { style: { color: '#d63638' } }, totalEnforced), __(' enforced features will be disabled', 'vaptguard')]),
                  ])
                ]),

                // Warning
                el('div', {
                  key: 'warning',
                  style: { background: '#fcf0f1', border: '1px solid #d63638', padding: '12px', borderRadius: '4px', marginBottom: '15px' }
                }, [
                  el('p', {
                    style: { margin: 0, color: '#d63638', fontWeight: '600', fontSize: '13px' }
                  }, __('⚠️ Warning: This action is IRREVERSIBLE. All history and implementation data will be permanently deleted.', 'vaptguard'))
                ]),

                // Feature List Table
                el('div', {
                  key: 'table-container',
                  style: { maxHeight: '250px', overflow: 'auto', border: '1px solid #ddd', borderRadius: '4px', marginBottom: '15px' }
                }, [
                  el('table', {
                    style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' }
                  }, [
                    el('thead', {
                      style: { background: '#f6f7f7', position: 'sticky', top: 0, zIndex: 1 }
                    }, [
                      el('tr', null, [
                        el('th', { style: { padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, __('Feature', 'vaptguard')),
                        el('th', { style: { padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd', width: '60px' } }, __('Status', 'vaptguard')),
                        el('th', { style: { padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd', width: '60px' } }, __('History', 'vaptguard')),
                        el('th', { style: { padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd', width: '50px' } }, __('Schema', 'vaptguard')),
                        el('th', { style: { padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd', width: '50px' } }, __('Impl', 'vaptguard')),
                      ])
                    ]),
                    el('tbody', null,
                      features.slice(0, 20).map((f, idx) =>
                        el('tr', {
                          key: f.feature_key || idx,
                          style: { borderBottom: '1px solid #eee', background: f.is_broken ? '#fff3cd' : 'transparent' }
                        }, [
                          el('td', { style: { padding: '8px' } }, f.feature_key),
                          el('td', {
                            style: { padding: '8px', textAlign: 'center', fontSize: '10px', fontWeight: '600' }
                          }, f.is_broken ? el('span', { style: { color: '#856404' } }, 'BROKEN') :
                            (f.is_release ? el('span', { style: { color: '#00a32a' } }, 'Release') : el('span', { style: { color: '#2271b1' } }, 'Develop'))),
                          el('td', { style: { padding: '8px', textAlign: 'center' } }, f.history_records),
                          el('td', {
                            style: { padding: '8px', textAlign: 'center', color: f.has_generated_schema ? '#d63638' : '#999' }
                          }, f.has_generated_schema ? '✓' : '-'),
                          el('td', {
                            style: { padding: '8px', textAlign: 'center', color: f.has_implementation_data ? '#d63638' : '#999' }
                          }, f.has_implementation_data ? '✓' : '-'),
                        ])
                      )
                    )
                  ]),
                  features.length > 20 && el('p', {
                    style: { fontStyle: 'italic', color: '#646970', margin: '8px', fontSize: '12px' }
                  }, sprintf(__('...and %d more features', 'vaptguard'), features.length - 20))
                ]),

                // Action Buttons
                el('div', {
                  key: 'actions',
                  style: { display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '15px', marginTop: '15px', borderTop: '2px solid #ddd' }
                }, [
                  el(Button, {
                    variant: 'secondary',
                    onClick: onCancel,
                    disabled: isExecuting,
                    style: { minWidth: '80px' }
                  }, __('Cancel', 'vaptguard')),
                  el(Button, {
                    variant: 'primary',
                    isDestructive: true,
                    isBusy: isExecuting,
                    disabled: isExecuting || count === 0,
                    onClick: onConfirm,
                    style: { minWidth: '180px', background: '#d63638', borderColor: '#d63638' }
                  }, isExecuting
                    ? __('Reverting...', 'vaptguard')
                    : sprintf(__('⚠️ Execute Revert (%d features)', 'vaptguard'), count))
                ])
              ]
          ])
        ]
    ]);
  };

  // Backward Transition Warning Modal
  const BackwardTransitionModal = ({ isOpen, onConfirm, onCancel, type }) => {
    if (!isOpen) return null;

    let title = __('Warning', 'vaptguard');
    let message = '';
    let confirmLabel = __('Confirm', 'vaptguard');
    let isProduction = false;

    if (type === 'reset') {
      title = __('Reset to Draft?', 'vaptguard');
      message = __('Warning: innovative "Clean Slate" protocol. Transitioning to Draft will **permanently delete** all implementation data, generated schemas, and history logs for this feature. This cannot be undone.', 'vaptguard');
      confirmLabel = __('Confirm Reset (Wipe Data)', 'vaptguard');
      checkboxLabel = __('I understand all history will be lost', 'vaptguard');
    } else if (type === 'production_regression') {
      title = __('⚠️ Production Impact Warning', 'vaptguard');
      message = __('You are demoting a **Released** feature. This feature may be active on multiple production sites.\n\nReverting to Test implies a potential defect that could impact live environments.', 'vaptguard');
      confirmLabel = __('Confirm Production Regression', 'vaptguard');
      checkboxLabel = __('I acknowledge this may impact live sites', 'vaptguard');
      isProduction = true;
    } else {
      title = __('Confirm Regression', 'vaptguard');
      // Added customization warning as requested
      message = __('Warning: You are moving this feature back to a previous stage within the cycle.\n\nPending verifications will be invalidated.\n**You may lose any customization applied to the Feature.**', 'vaptguard');
      confirmLabel = __('Confirm Regression', 'vaptguard');
      checkboxLabel = __('I acknowledge potential loss of customization', 'vaptguard');
    }

    const [acknowledged, setAcknowledged] = useState(false);

    return el(Modal, {
      title: title,
      onRequestClose: onCancel,
      className: 'vapt-warning-modal',
      style: { maxWidth: '500px' }
    }, [
      el('div', { style: { padding: '20px' } }, [
        el('div', { style: { display: 'flex', gap: '15px', alignItems: 'flex-start' } }, [
          el(Icon, { icon: 'warning', size: 36, style: { color: isProduction ? '#d63638' : '#d97706' } }),
          el('div', null, [
            el('p', { style: { marginTop: 0, fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-line' }, dangerouslySetInnerHTML: { __html: message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') } }),
            // Checkbox is now unconditional for all regressions
            el('div', { style: { marginTop: '15px', display: 'flex', alignItems: 'flex-start' } }, [
              el(CheckboxControl, {
                label: checkboxLabel,
                checked: acknowledged,
                onChange: setAcknowledged,
                style: { marginBottom: 0 }
              })
            ])
          ])
        ]),
        el('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '25px' } }, [
          el(Button, { isSecondary: true, onClick: onCancel }, __('Cancel', 'vaptguard')),
          el(Button, {
            isDestructive: true,
            disabled: !acknowledged, // Mandatory for all types
            onClick: onConfirm
          }, confirmLabel)
        ])
      ])
    ]);
  };

  // Lifecycle Indicator Component
  const LifecycleIndicator = ({ feature, onChange, onDirectUpdate }) => {
    const activeStep = feature.status;
    const [warningState, setWarningState] = useState(null); // { type, nextStatus }

    const steps = [
      { id: 'Draft', label: __('Draft', 'vaptguard') },
      { id: 'Develop', label: __('Develop', 'vaptguard') },
      { id: 'Test', label: __('Test', 'vaptguard') },
      { id: 'Release', label: __('Release', 'vaptguard') }
    ];

    const getStepValue = (status) => {
      const map = { 'Draft': 0, 'Develop': 1, 'Test': 2, 'Release': 3 };
      return map[status] || 0; // Default to 0 if unknown
    };

    const handleSelection = (nextStatus) => {
      const currentVal = getStepValue(activeStep);
      const nextVal = getStepValue(nextStatus);

      if (nextVal < currentVal) {
        // PCR: Backward Transition Warning
        let type = 'regression';
        if (nextStatus === 'Draft') type = 'reset';

        setWarningState({ type, nextStatus });
      } else {
        onChange(nextStatus);
      }
    };

    return el(Fragment, null, [
      el('div', { id: `vapt - lifecycle - controls - ${feature.key} `, className: 'vapt-flex-row', style: { fontSize: '12px' } }, [
        ...steps.map((step) => {
          const isChecked = step.id === activeStep;
          return el('label', {
            id: `vapt - lifecycle - label - ${feature.key} -${step.id} `,
            key: step.id,
            style: { cursor: 'pointer', color: isChecked ? '#2271b1' : 'inherit', fontWeight: isChecked ? '600' : 'normal' },
            className: 'vapt-flex-row'
          }, [
            el('input', {
              id: `vapt - lifecycle - radio - ${feature.key} -${step.id} `,
              type: 'radio',
              name: `lifecycle_${feature.key || feature.id}_${Math.random()} `,
              checked: isChecked,
              onChange: () => handleSelection(step.id),
              style: { margin: 0 }
            }),
            step.label
          ]);
        })
      ]),
      warningState && el(BackwardTransitionModal, {
        isOpen: true,
        type: warningState.type,
        onCancel: () => setWarningState(null),
        onConfirm: () => {
          const status = warningState.nextStatus;
          setWarningState(null);

          if (onDirectUpdate) {
            const isReset = status === 'Draft';
            const updates = {
              status: status,
              history_note: isReset ? 'History Reset by User (Clean Slate)' : 'Regression Confirmed'
            };

            if (isReset) {
              updates.reset_history = true;
              updates.has_history = false;
              updates.generated_schema = null;
              updates.implementation_data = null;
              updates.wireframe_url = '';
              updates.include_verification_engine = 0;
              updates.include_verification_guidance = 0;
            }

            onDirectUpdate(feature.key || feature.id, updates);
          } else {
            onChange(status); // Fallback if prop not provided
          }
        }
      })
    ]);
  };

  const DomainFeatures = ({ domains = [], features = [], isDomainModalOpen, selectedDomain, setDomainModalOpen, setSelectedDomain, updateDomainFeatures, addDomain, deleteDomain, batchDeleteDomains, setConfirmState, selectedDomains = [], setSelectedDomains, dataFiles = [], selectedFile, onSelectFile }) => {
    const [newDomain, setNewDomain] = useState('');
    const [isWildcardNew, setIsWildcardNew] = useState(false);
    const [activeCategory, setActiveCategory] = useState('all');
    const [severityFilters, setSeverityFilters] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'domain', direction: 'asc' });
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [editDomainData, setEditDomainData] = useState({ id: '', domain: '', is_wildcard: false, is_enabled: true });
    const [viewFeaturesModalOpen, setViewFeaturesModalOpen] = useState(false);
    const [viewFeaturesModalDomain, setViewFeaturesModalDomain] = useState(null);

    const toggleDomainSelection = (id) => {
      const current = selectedDomains || [];
      if (current.includes(id)) {
        setSelectedDomains(current.filter(i => i !== id));
      } else {
        setSelectedDomains([...current, id]);
      }
    };

    const sortedDomains = useMemo(() => {
      const sortable = [...(domains || [])];
      if (sortConfig.key !== null) {
        sortable.sort((a, b) => {
          let valA = a[sortConfig.key];
          let valB = b[sortConfig.key];

          // Special handling for domain types (Wildcard vs Standard)
          if (sortConfig.key === 'is_wildcard') {
            valA = (valA === '1' || valA === true || valA === 1) ? 1 : 0;
            valB = (valB === '1' || valB === true || valB === 1) ? 1 : 0;
          }

          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }
      return sortable;
    }, [domains, sortConfig]);

    const requestSort = (key) => {
      let direction = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
      }
      setSortConfig({ key, direction });
    };

    const SortIndicator = ({ column }) => {
      if (sortConfig.key !== column) return el(Dashicon, { icon: 'sort', size: 14, style: { opacity: 0.3, marginLeft: '5px' } });
      return el(Dashicon, {
        icon: sortConfig.direction === 'asc' ? 'arrow-up-alt2' : 'arrow-down-alt2',
        size: 14,
        style: { marginLeft: '5px', color: '#2271b1' }
      });
    };

    const filteredBySeverity = useMemo(() => {
      return (features || []).filter(f => {
        // 1. Inactive File Visibility Check (Superadmin)
        if (isSuper && !f.is_from_active_file) {
          const s = f.status ? f.status.toLowerCase() : 'draft';
          if (s === 'draft' || s === 'default' || !s) return false;
        }

        // 2. Only show Release State features
        const s = f.status ? f.status.toLowerCase() : 'draft';
        const normalizedStatus = (s === 'implemented') ? 'release' : s;
        if (normalizedStatus !== 'release') return false;

        // 3. Filter by severity level
        let severityLevel = 'medium';
        if (f.severity !== null && f.severity !== undefined) {
          if (typeof f.severity === 'object' && f.severity.level !== undefined) {
            severityLevel = f.severity.level.toLowerCase();
          } else if (typeof f.severity === 'string') {
            severityLevel = f.severity.toLowerCase();
          }
        }
        return (severityFilters || []).includes(severityLevel);
      });
    }, [features, severityFilters]);

    // Compute available severity levels from Release State features
    const availableSeverityLevels = useMemo(() => {
      const releaseStateFeatures = (features || []).filter(f => {
        const s = f.status ? f.status.toLowerCase() : 'draft';
        const normalizedStatus = (s === 'implemented') ? 'release' : s;
        return normalizedStatus === 'release';
      });

      const severitySet = new Set();
      releaseStateFeatures.forEach(f => {
        let severityLevel = 'medium';
        if (f.severity !== null && f.severity !== undefined) {
          if (typeof f.severity === 'object' && f.severity.level !== undefined) {
            severityLevel = f.severity.level.toLowerCase();
          } else if (typeof f.severity === 'string') {
            severityLevel = f.severity.toLowerCase();
          }
        }
        severitySet.add(severityLevel);
      });

      // Return in a consistent order: critical, high, medium, low
      const orderedSeverities = ['critical', 'high', 'medium', 'low'];
      return orderedSeverities.filter(level => severitySet.has(level));
    }, [features]);

    // Sync severityFilters with availableSeverityLevels when modal opens
    useEffect(() => {
      if (isDomainModalOpen && availableSeverityLevels.length > 0) {
        setSeverityFilters([...availableSeverityLevels]);
      }
    }, [isDomainModalOpen, availableSeverityLevels]);

    const categories = useMemo(() => {
      const cats = [...new Set(filteredBySeverity.map(f => f.category || 'Uncategorized'))].sort();
      return cats;
    }, [filteredBySeverity]);

    const displayFeatures = useMemo(() => {
      const filtered = filteredBySeverity || [];
      if (activeCategory === 'all') return filtered;
      return filtered.filter(f => (f.category || 'Uncategorized') === activeCategory);
    }, [filteredBySeverity, activeCategory]);

    const featuresByCategory = useMemo(() => {
      const grouped = {};
      (displayFeatures || []).forEach(f => {
        const cat = f.category || 'Uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(f);
      });
      // Sort categories to ensure consistent order
      const sortedResult = {};
      Object.keys(grouped).sort().forEach(key => {
        sortedResult[key] = grouped[key];
      });
      return sortedResult;
    }, [displayFeatures]);


    const domainStats = useMemo(() => {
      const doms = Array.isArray(domains) ? domains : [];
      return {
        total: doms.length,
        active: doms.filter(d => !(d.is_enabled === '0' || d.is_enabled === false || d.is_enabled === 0)).length,
        disabled: doms.filter(d => (d.is_enabled === '0' || d.is_enabled === false || d.is_enabled === 0)).length
      };
    }, [domains]);

    return el(Fragment, null, [
      el('div', {
        className: 'vapt-domain-features-header',
        style: {
          padding: '8px 16px',
          background: '#fff',
          borderBottom: '1px solid #dcdcde',
          marginBottom: '0'
        }
      }, el('h2', {
        style: { margin: 0, fontSize: '14px', fontWeight: 600, color: '#1e1e1e' }
      }, __('Domain Specific Features', 'vaptguard'))),
      el('div', { className: 'vapt-domain-features-body', style: { padding: '12px 0' } }, [
        // Summary Pill Row (Synced with Feature List)
        el('div', {
          style: {
            display: 'flex',
            gap: '15px',
            padding: '6px 15px',
            background: '#fff',
            border: '1px solid #dcdcde',
            borderRadius: '4px',
            marginBottom: '10px',
            alignItems: 'center',
            fontSize: '11px',
            color: '#333'
          }
        }, [
          el('span', { style: { fontWeight: '700', textTransform: 'uppercase', fontSize: '10px', color: '#666' } }, __('Summary:', 'vaptguard')),
          el('span', { style: { fontWeight: '600', color: '#2271b1' } }, sprintf(__('Total Domains: %d', 'vaptguard'), domainStats.total)),
          el('span', { style: { color: '#46b450', fontWeight: '700' } }, sprintf(__('Active: %d', 'vaptguard'), domainStats.active)),
          el('span', { style: { color: '#d63638', fontWeight: '600' } }, sprintf(__('Disabled: %d', 'vaptguard'), domainStats.disabled)),

        ]),


        el('table', { key: 'table', className: 'wp-list-table widefat fixed striped' }, [
          el('thead', null, el('tr', null, [
            el('th', { style: { width: '40px' } }, el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
              el(CheckboxControl, {
                checked: (domains || []).length > 0 && (selectedDomains || []).length === (domains || []).length,
                indeterminate: (selectedDomains || []).length > 0 && (selectedDomains || []).length < (domains || []).length,
                onChange: (val) => setSelectedDomains(val ? (domains || []).map(d => d.id) : []),
                __nextHasNoMarginBottom: true
              }),
              el('span', { style: { fontSize: '10px', opacity: 0.6, fontWeight: 600, whiteSpace: 'nowrap' } }, __('ALL', 'vaptguard'))
            ])),
            el('th', {
              style: { cursor: 'pointer', userSelect: 'none' },
              onClick: () => requestSort('domain')
            }, [
              __('Domain', 'vaptguard'),
              el(SortIndicator, { column: 'domain' })
            ]),
            el('th', { style: { width: '100px' } }, __('Status', 'vaptguard')),
            el('th', {
              style: { width: '180px', cursor: 'pointer', userSelect: 'none' },
              onClick: () => requestSort('is_wildcard')
            }, [
              __('Type', 'vaptguard'),
              el(SortIndicator, { column: 'is_wildcard' })
            ]),
            el('th', { style: { width: '120px' } }, __('License', 'vaptguard')),
            el('th', null, __('Features Enabled', 'vaptguard')),
            el('th', { style: { width: '120px' } }, __('Expiry Date', 'vaptguard')),
            el('th', { style: { width: '220px' } }, __('Actions', 'vaptguard'))
          ])),
          el('tbody', null, sortedDomains.map((d) => el('tr', { key: d.id }, [
            el('td', null, el(CheckboxControl, {
              checked: (selectedDomains || []).includes(d.id),
              onChange: () => toggleDomainSelection(d.id),
              __nextHasNoMarginBottom: true
            })),
            el('td', null, el('strong', null, d.domain)),
            el('td', null, el(Button, {
              isLink: true,
              onClick: () => {
                const currentEnabled = !(d.is_enabled === '0' || d.is_enabled === false || d.is_enabled === 0);
                addDomain(d.domain, (d.is_wildcard === '1' || d.is_wildcard === true || d.is_wildcard === 1), !currentEnabled, d.id);
              },
              style: { color: (d.is_enabled === '0' || d.is_enabled === false || d.is_enabled === 0) ? '#d63638' : '#00a32a', fontWeight: 600, textDecoration: 'none' },
              title: __('Click to toggle domain status', 'vaptguard')
            }, [
              el(Dashicon, { icon: (d.is_enabled === '0' || d.is_enabled === false || d.is_enabled === 0) ? 'hidden' : 'visibility', size: 16, style: { marginRight: '4px' } }),
              (d.is_enabled === '0' || d.is_enabled === false || d.is_enabled === 0) ? __('Disabled', 'vaptguard') : __('Active', 'vaptguard')
            ])),
            el('td', null, el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
              el(Button, {
                isLink: true,
                onClick: (e) => {
                  e.preventDefault();
                  const currentWildcard = (d.is_wildcard === '1' || d.is_wildcard === true || d.is_wildcard === 1);
                  const nextWildcard = !currentWildcard;
                  addDomain(d.domain, nextWildcard, !(d.is_enabled === '0' || d.is_enabled === false || d.is_enabled === 0), d.id);
                },
                style: { textDecoration: 'none', color: (d.is_wildcard === '1' || d.is_wildcard === true || d.is_wildcard === 1) ? '#2271b1' : '#64748b', fontWeight: 600 },
                title: __('Click to toggle domain type', 'vaptguard')
              }, (d.is_wildcard === '1' || d.is_wildcard === true || d.is_wildcard === 1) ? __('Wildcard', 'vaptguard') : __('Standard', 'vaptguard')),
              el(Dashicon, { icon: 'update', size: 14, style: { opacity: 0.5 } })
            ])),
            el('td', null, el('span', {
              style: {
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'capitalize',
                background: d.license_type === 'developer' ? '#f3e8ff' : (d.license_type === 'pro' ? '#fff1f2' : '#f1f5f9'),
                color: d.license_type === 'developer' ? '#6b21a8' : (d.license_type === 'pro' ? '#be123c' : '#475569'),
                border: '1px solid transparent'
              }
            }, d.license_type || 'Standard')),
            el('td', null, (Array.isArray(d.features) && d.features.length > 0) ? el(Button, {
              isLink: true,
              onClick: (e) => {
                e.preventDefault();
                setViewFeaturesModalDomain(d);
                setViewFeaturesModalOpen(true);
              }
            }, `${d.features.length} ${__('Features', 'vaptguard')} `) : `${(Array.isArray(d.features) ? d.features.length : 0)} ${__('Features', 'vaptguard')} `),
            el('td', null, el('span', { style: { fontSize: '12px', color: (d.license_type !== 'developer' && d.manual_expiry_date && new Date(d.manual_expiry_date) < new Date()) ? '#dc2626' : 'inherit' } },
              d.license_type === 'developer'
                ? __('Never', 'vaptguard')
                : (d.manual_expiry_date ? new Date(d.manual_expiry_date).toLocaleDateString() : '-')
            )),
            el('td', null, el('div', { style: { display: 'flex', gap: '8px' } }, [
              el(Button, {
                isSecondary: true,
                isSmall: true,
                onClick: () => {
                  setEditDomainData({
                    id: d.id,
                    domain: d.domain,
                    is_wildcard: (d.is_wildcard === '1' || d.is_wildcard === true || d.is_wildcard === 1),
                    is_enabled: !(d.is_enabled === '0' || d.is_enabled === false || d.is_enabled === 0)
                  });
                  setEditModalOpen(true);
                }
              }, __('Edit', 'vaptguard')),
              el(Button, {
                isSecondary: true,
                isSmall: true,
                onClick: () => { setSelectedDomain(d); setDomainModalOpen(true); }
              }, __('Manage Features', 'vaptguard')),
              el(Button, {
                isDestructive: true,
                isSmall: true,
                onClick: () => {
                  setConfirmState({
                    message: sprintf(__('Are you sure you want to delete the domain "%s"? This action cannot be undone.', 'vaptguard'), d.domain),
                    onConfirm: () => {
                      deleteDomain(d.id);
                      setConfirmState(null);
                    },
                    isDestructive: true
                  });
                }
              }, __('Delete', 'vaptguard'))
            ]))
          ])))
        ]),

        // Edit Domain Modal
        isEditModalOpen && el(Modal, {
          title: __('Edit Domain Settings', 'vaptguard'),
          onRequestClose: () => setEditModalOpen(false),
          style: { maxWidth: '500px' }
        }, [
          el('div', { style: { padding: '10px 0' } }, [
            el(TextControl, {
              label: __('Domain Name', 'vaptguard'),
              value: editDomainData.domain,
              onChange: (val) => setEditDomainData({ ...editDomainData, domain: val })
            }),
            el(SelectControl, {
              label: __('Type', 'vaptguard'),
              value: editDomainData.is_wildcard ? 'wildcard' : 'standard',
              options: [
                { label: __('Standard', 'vaptguard'), value: 'standard' },
                { label: __('Wildcard (*.domain)', 'vaptguard'), value: 'wildcard' }
              ],
              onChange: (val) => setEditDomainData({ ...editDomainData, is_wildcard: val === 'wildcard' })
            }),
            el(ToggleControl, {
              label: __('Enabled', 'vaptguard'),
              checked: editDomainData.is_enabled,
              onChange: (val) => setEditDomainData({ ...editDomainData, is_enabled: val }),
              help: __('Enable or disable all VAPT features for this domain.', 'vaptguard')
            }),
            el('div', { style: { marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' } }, [
              el(Button, { isSecondary: true, onClick: () => setEditModalOpen(false) }, __('Cancel', 'vaptguard')),
              el(Button, {
                isPrimary: true,
                onClick: () => {
                  addDomain(editDomainData.domain, editDomainData.is_wildcard, editDomainData.is_enabled, editDomainData.id);
                  setEditModalOpen(false);
                }
              }, __('Update Domain', 'vaptguard'))
            ])
          ])
        ]),
        isDomainModalOpen && selectedDomain && el(Modal, {
          key: 'modal',
          title: sprintf(__('Features for %s', 'vaptguard'), selectedDomain.domain),
          onRequestClose: () => setDomainModalOpen(false),
          className: 'vapt-domain-features-modal',
          style: { maxWidth: '1400px', width: '90%' }
        }, [
          // Severity Level Filters
          el('div', {
            style: {
              marginBottom: '20px',
              padding: '12px 20px',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }
          }, [
            el('span', { style: { fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' } }, __('Severity Level:')),
            el(Button, {
              isPrimary: (severityFilters || []).length !== availableSeverityLevels.length,
              variant: (severityFilters || []).length === availableSeverityLevels.length ? 'secondary' : 'primary',
              onClick: () => {
                if ((severityFilters || []).length === availableSeverityLevels.length) setSeverityFilters([]);
                else setSeverityFilters([...availableSeverityLevels]);
              },
              style: {
                fontWeight: 700,
                padding: '8px 20px',
                height: 'auto',
                boxShadow: (severityFilters || []).length !== availableSeverityLevels.length ? '0 2px 4px rgba(34, 113, 177, 0.2)' : 'none'
              }
            }, (severityFilters || []).length === availableSeverityLevels.length ? __('Reset All Filters', 'vaptguard') : __('Select All Severities', 'vaptguard')),
            el('div', { style: { display: 'flex', gap: '15px', paddingLeft: '20px', borderLeft: '2px solid #e2e8f0' } },
              availableSeverityLevels.map(level => {
                const labelMap = {
                  'critical': __('Critical', 'vaptguard'),
                  'high': __('High', 'vaptguard'),
                  'medium': __('Medium', 'vaptguard'),
                  'low': __('Low', 'vaptguard')
                };
                return el(CheckboxControl, {
                  key: level,
                  label: labelMap[level] || level,
                  checked: severityFilters.includes(level),
                  onChange: (val) => {
                    if (val) setSeverityFilters([...severityFilters, level]);
                    else if ((severityFilters || []).length > 1) setSeverityFilters(severityFilters.filter(v => v !== level));
                  },
                  __nextHasNoMarginBottom: true
                });
              })
            )
          ]),

          el('div', { style: { display: 'flex', gap: '0', height: '60vh', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' } }, [
            // Left Sidebar: Categories
            el('aside', {
              style: {
                width: '240px',
                flexShrink: 0,
                background: '#fcfcfd',
                borderRight: '1px solid #e2e8f0',
                padding: '20px 0',
                overflowY: 'auto'
              }
            }, [
              el('div', { style: { padding: '0 20px 10px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' } }, __('Feature Categories')),
              el('div', { id: 'vapt-domain-features-sidebar-categories', style: { display: 'flex', flexDirection: 'column' } }, [
                // All Categories Link
                el('a', {
                  id: 'vapt-category-link-all',
                  href: '#',
                  onClick: (e) => { e.preventDefault(); setActiveCategory('all'); },
                  className: 'vapt-sidebar-link' + (activeCategory === 'all' ? ' is-active' : ''),
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 20px',
                    textDecoration: 'none',
                    color: activeCategory === 'all' ? '#2271b1' : '#64748b',
                    background: activeCategory === 'all' ? '#eff6ff' : 'transparent',
                    fontWeight: activeCategory === 'all' ? 600 : 500,
                    fontSize: '13px',
                    borderRight: activeCategory === 'all' ? '3px solid #2271b1' : 'none'
                  }
                }, [
                  el('span', null, __('All Categories', 'vaptguard')),
                  el('span', { style: { fontSize: '10px', padding: '2px 6px', borderRadius: '10px', background: activeCategory === 'all' ? '#dbeafe' : '#f1f5f9' } }, (Array.isArray(filteredBySeverity) ? filteredBySeverity : []).length)
                ]),
                // Category Links
                ...categories.map(cat => {
                  const count = (Array.isArray(filteredBySeverity) ? filteredBySeverity : []).filter(f => (f.category || 'Uncategorized') === cat).length;
                  const isActive = activeCategory === cat;
                  return el('a', {
                    key: cat,
                    href: '#',
                    onClick: (e) => { e.preventDefault(); setActiveCategory(cat); },
                    className: 'vapt-sidebar-link' + (isActive ? ' is-active' : ''),
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 20px',
                      textDecoration: 'none',
                      color: isActive ? '#2271b1' : '#64748b',
                      background: isActive ? '#eff6ff' : 'transparent',
                      fontWeight: isActive ? 600 : 500,
                      fontSize: '13px',
                      borderRight: isActive ? '3px solid #2271b1' : 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'visible'
                    }
                  }, [
                    el('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, cat),
                    el('span', { style: { fontSize: '10px', padding: '2px 6px', borderRadius: '10px', background: isActive ? '#dbeafe' : '#f1f5f9', marginLeft: '8px', flexShrink: 0 } }, count)
                  ]);
                })
              ])
            ]),

            // Main Content: Feature Cards
            el('div', {
              style: {
                flexGrow: 1,
                padding: '25px',
                background: '#fff',
                overflowY: 'auto'
              }
            }, [
              ((Array.isArray(displayFeatures) ? displayFeatures : []).length === 0) ? el('div', { style: { textAlign: 'center', padding: '40px', color: '#94a3b8' } }, __('No features matching the current selection.', 'vaptguard')) :
                Object.entries(featuresByCategory).map(([catName, catFeatures]) => el(Fragment, { key: catName }, [
                  el('h3', { className: 'vapt-category-header' }, [
                    el(Dashicon, { icon: 'category', size: 16 }),
                    catName
                  ]),
                  el('div', { className: 'vapt-feature-grid' }, catFeatures.map(f => el('div', {
                    key: f.key,
                    className: `vapt - domain - feature - card ${f.exists_in_multiple_files ? 'vapt-feature-multi-file' : (f.is_from_active_file === false ? 'vapt-feature-inactive-only' : '')} `,
                    style: {
                      padding: '20px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      background: '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'all 0.3s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }
                  }, [
                    el('div', { style: { marginBottom: '20px' } }, [
                      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' } }, [
                        el('h4', { style: { margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e293b' } }, f.label),
                        el('span', {
                          className: `vapt - status - pill status - ${(f.status || '').toLowerCase()} `,
                          style: {
                            fontSize: '9px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            color: '#fff',
                            background: (f.status === 'Develop' || f.status === 'develop') ? '#10b981' :
                              (f.status === 'Test' || f.status === 'test') ? '#eab308' :
                                (f.status === 'Release' || f.status === 'release' || f.status === 'implemented') ? '#f97316' : '#94a3b8',
                            border: 'none',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                          }
                        }, f.status)
                      ]),
                      el('p', { style: { margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.5' } }, f.description)
                    ]),
                    el('div', {
                      id: `vapt - domain - feature - footer - ${f.key} `,
                      style: {
                        marginTop: 'auto',
                        paddingTop: '15px',
                        borderTop: '1px solid #f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }
                    }, [
                      el('span', { id: `vapt - domain - feature - status - text - ${f.key} `, style: { fontSize: '12px', fontWeight: 600, color: '#475569' } }, (Array.isArray(selectedDomain.features) ? selectedDomain.features : []).includes(f.key) ? __('Active', 'vaptguard') : __('Disabled', 'vaptguard')),
                      el(ToggleControl, {
                        checked: (Array.isArray(selectedDomain.features) ? selectedDomain.features : []).includes(f.key),
                        onChange: (val) => {
                          const newFeats = val
                            ? [...(Array.isArray(selectedDomain.features) ? selectedDomain.features : []), f.key]
                            : (Array.isArray(selectedDomain.features) ? selectedDomain.features : []).filter(k => k !== f.key);
                          updateDomainFeatures(selectedDomain.id, newFeats);
                          setSelectedDomain({ ...selectedDomain, features: newFeats });
                        },
                        __nextHasNoMarginBottom: true,
                        style: { margin: 0 }
                      })
                    ])
                  ])))
                ]))
            ])
          ]),
          el('div', { style: { marginTop: '20px', textAlign: 'right' } }, el(Button, {
            isPrimary: true,
            onClick: () => setDomainModalOpen(false)
          }, __('Done', 'vaptguard')))
        ]),
        // View Features Modal
        viewFeaturesModalOpen && viewFeaturesModalDomain && el(Modal, {
          id: 'vapt-view-features-modal',
          title: sprintf(__('Enabled Features for %s', 'vaptguard'), viewFeaturesModalDomain.domain),
          onRequestClose: () => setViewFeaturesModalOpen(false),
          style: { maxWidth: '1200px', width: '90%' }
        }, [
          (() => {
            // Filter features to only show Release state features enabled for this domain
            const releaseFeatures = (features || []).filter(f => {
              // Check if feature is enabled for this domain
              const isEnabledForDomain = (Array.isArray(viewFeaturesModalDomain.features) ? viewFeaturesModalDomain.features : []).includes(f.key);
              // Check if feature is in Release state (same logic as status display)
              const isReleaseState = f.status && (
                f.status === 'Release' ||
                f.status === 'release' ||
                f.status === 'implemented'
              );
              return isEnabledForDomain && isReleaseState;
            });

            return releaseFeatures.length > 0
              ? el('div', {
                id: 'vapt-view-features-grid-wrap',
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '20px',
                  padding: '20px',
                  maxHeight: '70vh',
                  overflowY: 'auto'
                }
              },
                releaseFeatures.map(f =>
                  el(Card, {
                    key: f.key,
                    style: { border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: 'sm' }
                  }, [
                    el(CardHeader, {
                      style: {
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '5px'
                      }
                    }, [
                      el('span', {
                        style: {
                          fontSize: '9px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#e2e8f0',
                          color: '#475569'
                        }
                      }, f.category || 'General'),
                      el('strong', { style: { fontSize: '13px', color: '#1e293b' } }, f.label)
                    ]),
                    el(CardBody, { style: { padding: '16px' } }, [
                      el('div', { style: { marginBottom: '10px' } }, [
                        el('span', {
                          style: {
                            display: 'inline-block',
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            color: '#fff',
                            background: (f.status === 'Develop' || f.status === 'develop') ? '#10b981' :
                              (f.status === 'Test' || f.status === 'test') ? '#eab308' :
                                (f.status === 'Release' || f.status === 'release' || f.status === 'implemented') ? '#f97316' : '#94a3b8',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                          }
                        }, f.status || 'Unknown')
                      ]),
                      el('p', { style: { fontSize: '12px', color: '#64748b', margin: 0, lineHeight: '1.5' } }, f.description)
                    ])
                  ])
                )
              )
              : el('div', {
                style: {
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '14px'
                }
              }, __('No Release State features enabled for this domain.', 'vaptguard'));
          })(),
          el('div', { style: { marginTop: '20px', textAlign: 'right', borderTop: '1px solid #e2e8f0', paddingTop: '15px' } },
            el(Button, { isPrimary: true, onClick: () => setViewFeaturesModalOpen(false) }, __('Close', 'vaptguard'))
          )
        ])
      ])
    ]);
  };


  // FieldRow MUST live outside BuildGenerator — if defined inside, 
  // React creates a new component type on every render, causing unmount/remount
  // on every keystroke and destroying input focus.
  const FieldRow = ({ label, children }) => el('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } }, [
    el('label', { style: { width: '85px', fontSize: '12px', fontWeight: '500', color: '#64748b', flexShrink: 0 } }, label),
    el('div', { style: { flex: 1 } }, children)
  ]);

  const BuildGenerator = ({ domains, features, activeFile, setAlertState }) => {
    const [buildDomain, setBuildDomain] = useState('');
    const [buildVersion, setBuildVersion] = useState(settings.pluginVersion || '3.5.1');
    const [includeConfig, setIncludeConfig] = useState(true);
    const [includeData, setIncludeData] = useState(false);
    const [whiteLabel, setWhiteLabel] = useState({
      name: 'VAPT Secure',
      description: '',
      author: 'Tanveer Malik',
      plugin_uri: 'https://vaptguard.net',
      author_uri: '#',
      text_domain: 'vapt-secure'
    });
    // Local draft state: captures typed values without triggering effects on every keystroke.
    // Fields bind to draftLabel for display/onChange, and commit to whiteLabel on onBlur.
    const [draftLabel, setDraftLabel] = useState({
      name: 'VAPT Secure',
      author: 'Tanveer Malik',
      plugin_uri: 'https://vaptguard.net',
      author_uri: '#'
    });
    // Keep draftLabel in sync if whiteLabel updates externally (e.g. on initial load)
    const whiteLabelRef = React.useRef(whiteLabel);
    useEffect(() => {
      if (
        whiteLabelRef.current.name !== whiteLabel.name ||
        whiteLabelRef.current.author !== whiteLabel.author ||
        whiteLabelRef.current.plugin_uri !== whiteLabel.plugin_uri ||
        whiteLabelRef.current.author_uri !== whiteLabel.author_uri
      ) {
        setDraftLabel({
          name: whiteLabel.name,
          author: whiteLabel.author,
          plugin_uri: whiteLabel.plugin_uri,
          author_uri: whiteLabel.author_uri
        });
      }
      whiteLabelRef.current = whiteLabel;
    }, [whiteLabel]);

    const [generating, setGenerating] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [importedAt, setImportedAt] = useState(null);
    const [licenseScope, setLicenseScope] = useState('single');
    const [installationLimit, setInstallationLimit] = useState(1);
    const [restrictFeatures, setRestrictFeatures] = useState(false); // Default: Open Mode

    // Auto-Generation Effect — only fires when committed whiteLabel fields or domain/features change
    useEffect(() => {
      const slug = whiteLabel.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const selectedDomain = (Array.isArray(domains) ? domains : []).find(d => d.domain === buildDomain);
      const allFeatures = Array.isArray(features) ? features : [];
      const featCount = allFeatures.filter(f =>
        f.status === 'Release' || f.status === 'release' || f.status === 'implemented'
      ).length;

      const domainContext = buildDomain
        ? `a dedicated security build for ${buildDomain}`
        : `a universal security hardening package`;
      const desc = `${whiteLabel.name} is ${domainContext}, delivering specialized Vulnerability Assessment and Penetration Testing (VAPT) protection against OWASP Top 10 vulnerabilities. ` +
        `This build integrates ${featCount} active security modules tailored for WordPress environments. ` +
        `Requires PHP 7.4 or higher and WordPress 6.0+; optimized for Apache/.htaccess, Nginx, Cloudflare, and PHP script enforcement. ` +
        `Generated by ${whiteLabel.name}.`;

      // Only update text_domain and description — do NOT update the fields the user is editing
      setWhiteLabel(prev => ({ ...prev, text_domain: slug, description: desc }));

      // Sync Imported At & Version Auto-Increment
      if (selectedDomain) {
        if (selectedDomain.imported_at) setImportedAt(selectedDomain.imported_at);
        else setImportedAt(null);
        const lastVersion = selectedDomain.version || '1.0.0';
        const vParts = lastVersion.split('.');
        if (vParts.length === 3) {
          setBuildVersion(`${vParts[0]}.${vParts[1]}.${parseInt(vParts[2], 10) + 1}`);
        } else {
          setBuildVersion('1.0.0');
        }
      } else {
        setImportedAt(null);
        setBuildVersion('1.0.0');
      }
      // Only runs when committed values change — NOT on every keystroke
    }, [whiteLabel.name, whiteLabel.author, whiteLabel.plugin_uri, whiteLabel.author_uri, buildDomain, domains, features]);

    const runBuild = (type = 'full_build') => {
      if (!buildDomain && type !== 'config_only') {
        setAlertState({ message: __('Please select a target domain.', 'vaptguard'), type: 'error' });
        return;
      }
      setGenerating(true);
      setDownloadUrl(null);
      const selectedDomain = (Array.isArray(domains) ? domains : []).find(d => d.domain === buildDomain);
      const buildFeatures = selectedDomain ? (Array.isArray(selectedDomain.features) ? selectedDomain.features : []) : (Array.isArray(features) ? features : []).filter(f => f.status === 'implemented').map(f => f.key);

      apiFetch({
        path: 'vaptguard/v1/build/generate',
        method: 'POST',
        data: {
          domain: buildDomain.trim(),
          version: buildVersion.trim(),
          features: buildFeatures,
          generate_type: type,
          include_config: includeConfig,
          include_data: includeData,
          license_scope: licenseScope,
          installation_limit: installationLimit,
          restrict_features: restrictFeatures,
          white_label: {
            name: whiteLabel.name.trim(),
            description: whiteLabel.description.trim(),
            author: whiteLabel.author.trim(),
            plugin_uri: whiteLabel.plugin_uri.trim(),
            author_uri: whiteLabel.author_uri.trim(),
            text_domain: whiteLabel.text_domain.trim()
          }
        }
      }).then((res) => {
        if (res && res.download_url) {
          window.location.href = res.download_url;
          setAlertState({ message: __('Build generated and downloading!', 'vaptguard'), type: 'success' });
        } else {
          setAlertState({ message: __('Build failed: No download URL received.', 'vaptguard'), type: 'error' });
        }
        setGenerating(false);
      }).catch((error) => {
        setGenerating(false);
        setAlertState({ message: __('Build failed! ' + (error.message || ''), 'vaptguard'), type: 'error' });
      });
    };

    const saveToServer = () => {
      if (!buildDomain) {
        setAlertState({ message: __('Please select a target domain.', 'vaptguard'), type: 'error' });
        return;
      }
      setGenerating(true);
      const selectedDomain = (Array.isArray(domains) ? domains : []).find(d => d.domain === buildDomain);
      const buildFeatures = selectedDomain ? (Array.isArray(selectedDomain.features) ? selectedDomain.features : []) : [];

      apiFetch({
        path: 'vaptguard/v1/build/save-config',
        method: 'POST',
        data: {
          domain: buildDomain.trim(),
          version: buildVersion.trim(),
          features: buildFeatures,
          license_scope: licenseScope,
          installation_limit: installationLimit,
          restrict_features: restrictFeatures
        }
      }).then(res => {
        if (res.success) {
          setAlertState({ message: __('Config saved to server successfully!', 'vaptguard'), type: 'success' });
        } else {
          setAlertState({ message: __('Failed to save config.', 'vaptguard'), type: 'error' });
        }
        setGenerating(false);
      }).catch(err => {
        setGenerating(false);
        setAlertState({ message: 'Save failed: ' + err.message, type: 'error' });
      });
    };

    const forceReImport = () => {
      if (!buildDomain) return;
      setGenerating(true);
      apiFetch({
        path: 'vaptguard/v1/build/sync-config',
        method: 'POST',
        data: { domain: buildDomain }
      }).then(res => {
        if (res.success) {
          setImportedAt(res.imported_at);
          setAlertState({ message: `Config Re - Imported! Found ${res.features_count} features.`, type: 'success' });
        } else {
          setAlertState({ message: 'Import Failed: ' + (res.error || 'Unknown'), type: 'warning' });
        }
        setGenerating(false);
      }).catch(err => {
        setGenerating(false);
        setAlertState({ message: 'Import Error: ' + err.message, type: 'error' });
      });
    }

    return el('div', { className: 'vapt-build-generator' }, [
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '25px', marginTop: '30px' } }, [
        el(Icon, { icon: 'hammer', size: 24 }),
        el('h2', { style: { margin: 0, fontSize: '20px' } }, __('Generate New Build', 'vaptguard'))
      ]),
      // 60/40 Layout
      el('div', { style: { display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '25px', alignItems: 'start' } }, [

        // LEFT COLUMN: Configuration
        el(Card, { style: { display: 'flex', flexDirection: 'column', borderRadius: '8px', border: '1px solid #e2e8f0', height: '100%' } }, [
          el(CardHeader, { style: { background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '12px 20px' } }, [
            el('h3', { style: { margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' } }, [
              el(Icon, { icon: 'admin-settings', size: 16 }),
              __('Configuration Details', 'vaptguard')
            ])
          ]),
          el(CardBody, { style: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', flex: 1 } }, [
            // Domain & Config Toggle (Side-by-Side)
            el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', padding: '12px 20px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' } }, [
              // LEFT GROUP: Target Domain + Scope Badge
              el('div', { style: { display: 'flex', alignItems: 'center', gap: '15px' } }, [
                el('label', { style: { fontSize: '12px', fontWeight: '500', color: '#64748b', marginRight: '5px' } }, __('Target Domain', 'vaptguard')),
                el('div', { style: { width: '320px' } },
                  el(SelectControl, {
                    value: buildDomain,
                    options: [
                      { label: __('--- Select Target Domain ---', 'vaptguard'), value: '' },
                      ...(Array.isArray(domains) ? domains : []).filter(d => {
                        const domainFeatureKeys = Array.isArray(d.features) ? d.features : [];
                        const releasedFeatureKeys = new Set(
                          (Array.isArray(features) ? features : [])
                            .filter(f => f.status === 'Release' || f.status === 'release' || f.status === 'implemented')
                            .map(f => f.key)
                        );
                        return domainFeatureKeys.some(key => releasedFeatureKeys.has(key));
                      }).map(d => ({ label: d.domain, value: d.domain }))
                    ],
                    onChange: (val) => {
                      setBuildDomain(val);
                      const dom = (Array.isArray(domains) ? domains : []).find(d => d.domain === val);
                      if (dom) setLicenseScope(dom.license_scope || 'single');
                    },
                    __nextHasNoMarginBottom: true,
                    style: { marginBottom: 0 }
                  })
                ),
                // Readonly License Scope Badge
                el('span', {
                  style: {
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '4px 12px',
                    borderRadius: '12px',
                    background: licenseScope === 'multisite' ? '#dbeafe' : '#dcfce7',
                    color: licenseScope === 'multisite' ? '#1d4ed8' : '#15803d',
                    border: `1px solid ${licenseScope === 'multisite' ? '#bfdbfe' : '#bbf7d0'}`,
                    whiteSpace: 'nowrap',
                    lineHeight: '1'
                  }
                }, licenseScope === 'multisite' ? __('Multi-Site', 'vaptguard') : __('Single Domain', 'vaptguard'))
              ]),

              // RIGHT GROUP: Configuration Toggles
              el('div', { style: { display: 'flex', alignItems: 'center', gap: '20px' } }, [
                // Include Config Toggle
                el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                  el('div', { style: { marginBottom: 0, lineHeight: 1 } },
                    el(ToggleControl, {
                      label: __('Include Config', 'vaptguard'),
                      checked: includeConfig,
                      onChange: (val) => setIncludeConfig(val),
                      help: null,
                      __nextHasNoMarginBottom: true,
                      style: { marginBottom: 0 }
                    })
                  ),
                  el(Tooltip, { text: __('Include current feature configurations & security rules.', 'vaptguard') },
                    el('span', { className: 'dashicons dashicons-editor-help', style: { fontSize: '14px', color: '#94a3b8', cursor: 'help' } })
                  )
                ]),
                // Include Active Data Toggle
                el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                  el('div', { style: { marginBottom: 0, lineHeight: 1 } },
                    el(ToggleControl, {
                      label: __('Include Active Data', 'vaptguard'),
                      checked: includeData,
                      onChange: (val) => setIncludeData(val),
                      help: null,
                      __nextHasNoMarginBottom: true,
                      style: { marginBottom: 0 }
                    })
                  ),
                  el(Tooltip, { text: sprintf(__('Include Risk Catalog and definitions from active file: %s.', 'vaptguard'), activeFile || 'Default') },
                    el('span', { className: 'dashicons dashicons-editor-help', style: { fontSize: '14px', color: '#94a3b8', cursor: 'help' } })
                  )
                ]),
                // Restrict Features Toggle
                el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                  el('div', { style: { marginBottom: 0, lineHeight: 1 } },
                    el(ToggleControl, {
                      label: __('Restrict Features', 'vaptguard'),
                      checked: restrictFeatures,
                      onChange: (val) => setRestrictFeatures(val),
                      help: null,
                      __nextHasNoMarginBottom: true,
                      style: { marginBottom: 0 }
                    })
                  ),
                  el(Tooltip, { text: __('Restrict plugin to only selected features. When OFF, custom-developed features will also work.', 'vaptguard') },
                    el('span', { className: 'dashicons dashicons-editor-help', style: { fontSize: '14px', color: '#94a3b8', cursor: 'help' } })
                  )
                ])
              ])
            ]),

            // Horizontal Fields in 2-Col Grid
            el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', background: '#eef2f6', padding: '15px', borderRadius: '6px', border: '1px solid #e2e8f0' } }, [
              // Col 1
              el('div', null, [
                el(FieldRow, { label: __('Plugin Name', 'vaptguard') },
                  el(TextControl, {
                    value: draftLabel.name,
                    onChange: (val) => setDraftLabel(prev => ({ ...prev, name: val })),
                    onBlur: () => setWhiteLabel(prev => ({ ...prev, name: draftLabel.name })),
                    style: { marginBottom: 0 }
                  })
                ),
                el(FieldRow, { label: __('Author', 'vaptguard') },
                  el(TextControl, {
                    value: draftLabel.author,
                    onChange: (val) => setDraftLabel(prev => ({ ...prev, author: val })),
                    onBlur: () => setWhiteLabel(prev => ({ ...prev, author: draftLabel.author })),
                    style: { marginBottom: 0 }
                  })
                ),
                el(FieldRow, { label: __('Text Domain', 'vaptguard') },
                  el(TextControl, { value: whiteLabel.text_domain, readOnly: true, style: { marginBottom: 0, background: '#f1f5f9' } })
                ),
              ]),
              // Col 2
              el('div', null, [
                el(FieldRow, { label: __('Plugin URI', 'vaptguard') },
                  el(TextControl, {
                    value: draftLabel.plugin_uri,
                    onChange: (val) => setDraftLabel(prev => ({ ...prev, plugin_uri: val })),
                    onBlur: () => setWhiteLabel(prev => ({ ...prev, plugin_uri: draftLabel.plugin_uri })),
                    style: { marginBottom: 0 }
                  })
                ),
                el(FieldRow, { label: __('Author URI', 'vaptguard') },
                  el(TextControl, {
                    value: draftLabel.author_uri,
                    onChange: (val) => setDraftLabel(prev => ({ ...prev, author_uri: val })),
                    onBlur: () => setWhiteLabel(prev => ({ ...prev, author_uri: draftLabel.author_uri })),
                    style: { marginBottom: 0 }
                  })
                ),
                el(FieldRow, { label: __('Version', 'vaptguard') },
                  el(TextControl, { value: buildVersion, onChange: (val) => setBuildVersion(val), style: { marginBottom: 0 } })
                ),
              ]),
            ]),

            el('div', { style: { marginTop: '5px' } }, [
              el('label', { style: { display: 'block', fontSize: '12px', fontWeight: '500', color: '#64748b', marginBottom: '8px' } }, __('Plugin Description', 'vaptguard')),
              el(TextareaControl, {
                value: whiteLabel.description,
                rows: 3,
                onChange: (val) => setWhiteLabel({ ...whiteLabel, description: val }),
                style: { marginBottom: '0', fontSize: '13px', lineHeight: '1.5' }
              })
            ]),

            el('div', { style: { display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '15px', borderTop: '1px solid #eee' } }, [
              el(Button, {
                isSecondary: true,
                style: { flex: 1, justifyContent: 'center' },
                onClick: saveToServer,
                disabled: generating || !buildDomain
              }, [
                el(Icon, { icon: 'upload', size: 18, style: { marginRight: '5px' } }),
                __('Save to Server', 'vaptguard')
              ]),
              el(Button, {
                isPrimary: true,
                style: { flex: 1, justifyContent: 'center', background: '#357abd' },
                onClick: () => runBuild('full_build'),
                disabled: generating || !buildDomain
              }, [
                el(Icon, { icon: 'download', size: 18, style: { marginRight: '5px' } }),
                generating ? __('Generating...', 'vaptguard') : __('Download Build', 'vaptguard')
              ])
            ])
          ])
        ]),

        // RIGHT COLUMN: Status
        el(Card, { style: { borderRadius: '8px', border: '1px solid #e2e8f0', height: '100%', background: '#fff' } }, [
          el(CardHeader, { style: { background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '12px 20px' } }, [
            el('h4', { style: { margin: 0, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' } }, [
              el(Icon, { icon: 'info-outline', size: 16 }),
              __('Build Status & History', 'vaptguard')
            ])
          ]),
          el(CardBody, { style: { padding: '20px' } }, [
            el('div', { style: { fontSize: '13px', color: '#64748b', lineHeight: '1.8' } }, [
              el('div', { style: { marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                el('strong', null, __('Generated Version', 'vaptguard')),
                el('span', { style: { fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' } }, buildVersion)
              ]),
              el('div', { style: { marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                el('strong', null, __('Target Domain', 'vaptguard')),
                el('span', {
                  style: {
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: buildDomain ? '#e0f2fe' : '#f1f5f9',
                    color: buildDomain ? '#0369a1' : '#64748b'
                  }
                }, buildDomain || __('None', 'vaptguard'))
              ]),
              el('div', { style: { marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                el('strong', null, __('Active Features', 'vaptguard')),
                el('span', { style: { fontWeight: '600', color: '#16a34a' } }, (() => {
                  const selectedDomain = (domains || []).find(d => d.domain === buildDomain);
                  return (selectedDomain ? (selectedDomain.features?.length || 0) : 0) + ' Modules';
                })())
              ]),
              el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                el('strong', null, __('Last Import', 'vaptguard')),
                el('span', { style: { fontSize: '11px', fontStyle: 'italic' } }, importedAt || __('Never', 'vaptguard'))
              ])
            ]),
            el(Button, {
              isSecondary: true,
              style: { width: '100%', marginTop: '20px', justifyContent: 'center' },
              onClick: forceReImport,
              disabled: generating || !buildDomain || (buildDomain !== window.location.hostname && buildDomain !== window.location.hostname.replace(/^www\./, ''))
            }, __('Force Re-import from Server', 'vaptguard')),
            el('p', {
              style: { fontSize: '11px', color: (buildDomain && buildDomain !== window.location.hostname && buildDomain !== window.location.hostname.replace(/^www\./, '')) ? '#ef4444' : '#94a3b8', marginTop: '10px', textAlign: 'center' }
            }, (buildDomain && buildDomain !== window.location.hostname && buildDomain !== window.location.hostname.replace(/^www\./, ''))
              ? __('This action is only available for the current active domain.', 'vaptguard')
              : __('Forces sync with vapt-locked-config.php', 'vaptguard'))
          ])
        ])
      ])
    ]);
  };



  const LicenseManager = ({ domains, fetchData, isSuper, loading, addDomain, deleteDomain, globalSetConfirmState, deletingId }) => {
    // Manage state for the selected domain (if multiple, allows switching)
    const [selectedDomainId, setSelectedDomainId] = useState(() => (Array.isArray(domains) && domains.length > 0) ? domains[0].id : null);

    // Derived current domain object
    const currentDomain = useMemo(() => {
      const doms = Array.isArray(domains) ? domains : [];
      // Use loose equality to handle string/number ID mismatches
      const found = doms.find(d => d.id == selectedDomainId);
      // console.log('LicenseManager Selection Debug:', { selectedDomainId, found, allDomains: doms });
      return found || (doms.length > 0 ? doms[0] : null);
    }, [domains, selectedDomainId]);

    // Local Form State

    const licenseUsage = useMemo(() => {
      const usage = {};
      (domains || []).forEach(d => {
        if (!d.license_id) return;
        if (!usage[d.license_id]) usage[d.license_id] = 0;
        if (!(d.is_enabled === '0' || d.is_enabled === false || d.is_enabled === 0)) {
          usage[d.license_id]++;
        }
      });
      return usage;
    }, [domains]);
    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    };

    const [formState, setFormState] = useState({
      domain: '',
      is_wildcard: false,
      license_id: '',
      license_type: 'standard',
      manual_expiry_date: '',
      auto_renew: false,
      license_scope: 'single',
      installation_limit: 1
    });

    // New Domain Mode State
    const [isCreatingNew, setIsCreatingNew] = useState(false);

    // Sorting and Filtering state for the table
    const [sortBy, setSortBy] = useState('domain');
    const [sortOrder, setSortOrder] = useState('asc');
    const [searchQuery, setSearchQuery] = useState('');

    const sortedDomains = useMemo(() => {
      let doms = Array.isArray(domains) ? [...domains] : [];

      // Application of search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        doms = doms.filter(d =>
          (d.domain || '').toLowerCase().includes(query) ||
          (d.license_id || '').toLowerCase().includes(query)
        );
      }

      // Sorting logic
      doms.sort((a, b) => {
        let valA = a[sortBy] || '';
        let valB = b[sortBy] || '';

        // Handle date sorting
        if (sortBy === 'first_activated_at' || sortBy === 'manual_expiry_date') {
          valA = valA ? new Date(valA).getTime() : 0;
          valB = valB ? new Date(valB).getTime() : 0;
        }

        if (typeof valA === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
      return doms;
    }, [domains, sortBy, sortOrder, searchQuery]);

    const [isSaving, setIsSaving] = useState(false);
    const [localStatus, setLocalStatus] = useState(null);
    const [confirmState, setConfirmState] = useState({ isOpen: false, type: null });

    // Sync form with current domain when selection changes or domain updates
    useEffect(() => {
      if (currentDomain && !isSaving && !loading) {
        const newDomain = currentDomain.domain || '';
        const newWildcard = !!parseInt(currentDomain.is_wildcard || 0);
        const newLicenseId = currentDomain.license_id || '';
        const newType = currentDomain.license_type || 'standard';
        const newExpiry = currentDomain.manual_expiry_date ? currentDomain.manual_expiry_date.split(' ')[0] : '';
        const newAuto = !!parseInt(currentDomain.auto_renew);

        const newScope = currentDomain.license_scope || 'single';
        const newLimit = parseInt(currentDomain.installation_limit) || 1;

        // Only update if actually different to prevent flickering
        if (formState.domain !== newDomain ||
          formState.is_wildcard !== newWildcard ||
          formState.license_id !== newLicenseId ||
          formState.license_type !== newType ||
          formState.manual_expiry_date !== newExpiry ||
          formState.auto_renew !== newAuto ||
          formState.license_scope !== newScope ||
          formState.installation_limit !== newLimit) {
          setFormState({
            domain: newDomain,
            is_wildcard: newWildcard,
            license_id: newLicenseId,
            license_type: newType,
            manual_expiry_date: newExpiry,
            auto_renew: newAuto,
            license_scope: newScope,
            installation_limit: newLimit
          });
        }
      }
    }, [currentDomain, isSaving, loading]);

    const isDirty = (currentDomain || isCreatingNew) ? (
      isCreatingNew ||
      formState.domain !== (currentDomain.domain || '') ||
      formState.is_wildcard !== !!parseInt(currentDomain.is_wildcard || 0) ||
      formState.license_id !== (currentDomain.license_id || '') ||
      formState.license_type !== (currentDomain.license_type || 'standard') ||
      formState.manual_expiry_date !== (currentDomain.manual_expiry_date ? currentDomain.manual_expiry_date.split(' ')[0] : '') ||
      formState.auto_renew !== !!parseInt(currentDomain.auto_renew) ||
      formState.license_scope !== (currentDomain.license_scope || 'single') ||
      formState.installation_limit !== (parseInt(currentDomain.installation_limit) || 1)
    ) : false;

    if (!currentDomain) {
      if (loading) {
        return el(PanelBody, { title: __('License & Subscription Management', 'vaptguard'), initialOpen: true },
          el('div', { style: { padding: '30px', textAlign: 'center' } }, el('span', { className: 'components-spinner' }))
        );
      }
      return el(PanelBody, { title: __('License & Subscription Management', 'vaptguard'), initialOpen: true },
        el('div', { style: { padding: '30px', textAlign: 'center' } }, [
          el('div', { style: { marginBottom: '20px', color: '#666' } }, __('No domains configured.', 'vaptguard')),

          // Auto-Provision for Superadmins/Admins
          el('div', {
            style: {
              padding: '20px',
              background: '#f0f6fc',
              border: '1px solid #cce5ff',
              borderRadius: '8px',
              maxWidth: '500px',
              margin: '0 auto'
            }
          }, [
            el('h3', { style: { marginTop: 0 } }, __('Initialize Workspace License', 'vaptguard')),
            el('p', null, sprintf(__('Detected environment: %s', 'vaptguard'), window.location.hostname)),
            el('p', { style: { fontSize: '12px', color: '#666' } }, __('As a Superadmin, you can instantly provision a Developer License for this domain.', 'vaptguard')),

            el(Button, {
              isPrimary: true,
              isBusy: isSaving,
              onClick: () => {
                setIsSaving(true);
                const hostname = window.location.hostname;
                // Calculate 100 years from now for Developer
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 36500);
                const expiry = tomorrow.toISOString().split('T')[0];

                apiFetch({
                  path: 'vaptguard/v1/domains/update',
                  method: 'POST',
                  data: {
                    domain: hostname,
                    license_type: 'developer',
                    auto_renew: 1,
                    manual_expiry_date: expiry,
                    license_id: 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase()
                  }
                }).then(() => {
                  setLocalStatus({ message: 'Domain Provisioned!', type: 'success' });
                  fetchData(); // Will trigger re-render with new domain
                }).catch(err => {
                  setIsSaving(false);
                  setLocalStatus({ message: 'Provision Failed: ' + err.message, type: 'error' });
                });
              }
            }, sprintf(__('Provision %s (Developer)', 'vaptguard'), window.location.hostname)),

            localStatus && el('p', { style: { color: localStatus.type === 'error' ? 'red' : 'green', marginTop: '10px' } }, localStatus.message)
          ])
        ])
      );
    }

    const handleUpdate = (isManualRenew = false) => {
      setIsSaving(true);
      setLocalStatus({
        message: isManualRenew ? __('Performing Manual Renewal...', 'vaptguard') : __('Updating License...', 'vaptguard'),
        type: 'info'
      });

      let payload = {
        id: isCreatingNew ? undefined : currentDomain.id,
        domain: formState.domain,
        is_wildcard: formState.is_wildcard ? 1 : 0,
        license_id: formState.license_id,
        license_type: formState.license_type,
        manual_expiry_date: formState.manual_expiry_date,
        auto_renew: (formState.license_type === 'developer' || formState.auto_renew) ? 1 : 0,
        license_scope: formState.license_scope,
        installation_limit: formState.installation_limit,
        action: isManualRenew ? 'manual_renew' : 'update'
      };

      // Manual Renew Logic
      if (isManualRenew) {
        const baseDateStr = currentDomain.manual_expiry_date || new Date().toISOString().split('T')[0];
        const parts = baseDateStr.split(' ')[0].split('-');
        // Create date in local time at 00:00:00 using parts
        const baseDate = new Date(parts[0], parts[1] - 1, parts[2]);

        let durationDays = 30;
        if (formState.license_type === 'pro') durationDays = 365;
        if (formState.license_type === 'developer') durationDays = 36500; // ~100 years

        baseDate.setDate(baseDate.getDate() + durationDays);

        // Format back to YYYY-MM-DD manually to avoid UTC shift
        const y = baseDate.getFullYear();
        const m = String(baseDate.getMonth() + 1).padStart(2, '0');
        const d = String(baseDate.getDate()).padStart(2, '0');
        payload.manual_expiry_date = `${y} -${m} -${d} `;
        payload.renew_source = 'manual'; // Explicitly tag as manual
      }

      apiFetch({
        path: 'vaptguard/v1/domains/update',
        method: 'POST',
        data: payload
      }).then(res => {
        if (res.success && res.domain) {
          setLocalStatus({ message: isCreatingNew ? __('Domain Registered!', 'vaptguard') : __('License Updated!', 'vaptguard'), type: 'success' });
          return fetchData().finally(() => {
            setIsSaving(false);
            if (isCreatingNew) {
              setIsCreatingNew(false);
              setSelectedDomainId(res.domain.id);
            }
            setTimeout(() => setLocalStatus(null), 3000);
          });
        }
        setIsSaving(false);
      }).catch(err => {
        setLocalStatus({ message: isCreatingNew ? __('Failed to register', 'vaptguard') : __('Update Failed', 'vaptguard'), type: 'error' });
        setIsSaving(false);
        setTimeout(() => setLocalStatus(null), 3000);
      });
    };

    const handleRollback = (type) => {
      setConfirmState({ isOpen: true, type });
    };

    const executeRollback = () => {
      const type = confirmState.type;
      setConfirmState({ isOpen: false, type: null });

      setIsSaving(true);
      setLocalStatus({ message: __('Reverting Renewals...', 'vaptguard'), type: 'info' });

      apiFetch({
        path: 'vaptguard/v1/domains/update',
        method: 'POST',
        data: {
          domain: currentDomain.domain,
          action: type
        }
      }).then(res => {
        if (res.success && res.domain) {
          setLocalStatus({ message: __('Rollback Successful!', 'vaptguard'), type: 'success' });
          return fetchData();
        }
      }).catch(err => {
        setLocalStatus({ message: __('Rollback Failed', 'vaptguard'), type: 'error' });
      }).finally(() => {
        setIsSaving(false);
        setTimeout(() => setLocalStatus(null), 3000);
      });
    };


    const toggleSort = (key) => {
      if (sortBy === key) {
        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        setSortBy(key);
        setSortOrder('asc');
      }
    };

    const handleEdit = (domain) => {
      setSelectedDomainId(domain.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return el('div', { className: 'vapt-license-management-container' }, [
      // Section Header (No collapsible arrow)
      el('h2', { style: { padding: '16px 16px 10px', margin: 0, fontSize: '14px', fontWeight: 600, color: '#1e1e1e' } }, __('License & Subscription Management', 'vaptguard')),
      // TOP: Two-Column Form Grid
      el('div', { className: 'vapt-license-grid' }, [
        // LEFT: Status Card
        el('div', { className: 'vapt-license-card' }, [
          el('div', { className: 'vapt-card-header-row', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' } }, [
            el('h3', { style: { margin: 0 } }, __('License Status', 'vaptguard')),
            el('span', { className: `vapt-license-badge ${currentDomain.license_type || 'standard'}` },
              (currentDomain.license_type || 'Standard').toUpperCase()
            )
          ]),

          el('div', { className: 'vapt-info-row', style: { marginBottom: '15px' } }, [
            el(TextControl, {
              label: __('Domain Name', 'vaptguard'),
              value: currentDomain.domain,
              readOnly: true,
              style: { background: '#f8fafc', color: '#64748b' }
            })
          ]),

          el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' } }, [
            el(TextControl, {
              label: __('First Activated', 'vaptguard'),
              value: currentDomain.first_activated_at ? formatDate(currentDomain.first_activated_at) : __('Not Activated', 'vaptguard'),
              readOnly: true,
              style: { background: '#f8fafc', color: '#64748b' }
            }),
            el(TextControl, {
              label: __('Expiry Date', 'vaptguard'),
              value: currentDomain.license_type === 'developer'
                ? __('Never Expires', 'vaptguard')
                : (currentDomain.manual_expiry_date ? formatDate(currentDomain.manual_expiry_date) : ''),
              readOnly: true,
              style: {
                background: '#f8fafc',
                color: (currentDomain.license_type !== 'developer' && currentDomain.manual_expiry_date && new Date(currentDomain.manual_expiry_date) < new Date()) ? '#dc2626' : '#64748b'
              }
            })
          ]),

          el('div', { className: 'components-base-control', style: { marginBottom: '15px' } }, [
            el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #949494', borderRadius: '4px', padding: '0 12px', height: '40px' } }, [
              el('span', { style: { color: '#1e1e1e', fontSize: '13px', fontWeight: 500 } }, __('Terms Renewed', 'vaptguard')),
              el('span', { style: { color: '#64748b', fontSize: '13px' } }, `${currentDomain.renewals_count || 0} Times`)
            ])
          ]),

          el('div', { className: 'vapt-desc-text' },
            currentDomain.license_type === 'developer'
              ? __('Developer License: Perpetual access with no expiration.', 'vaptguard')
              : (currentDomain.license_type === 'pro'
                ? __('Pro License: Annual renewal cycle with premium features.', 'vaptguard')
                : __('Standard License: 30-day renewal cycle.', 'vaptguard'))
          ),

          localStatus && el('div', {
            style: {
              marginTop: '15px',
              padding: '8px',
              borderRadius: '4px',
              background: localStatus.type === 'error' ? '#fde8e8' : '#def7ec',
              color: localStatus.type === 'error' ? '#9b1c1c' : '#03543f',
              fontSize: '12px', textAlign: 'center'
            }
          }, localStatus.message)
        ]),

        // RIGHT: Update Form
        el('div', { className: 'vapt-license-card' }, [
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' } }, [
            el('div', { style: { flex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              el('h3', { style: { margin: 0 } }, isCreatingNew ? __('Register New Domain', 'vaptguard') : __('Update License', 'vaptguard')),
              (!isCreatingNew && el(Button, {
                isSmall: true,
                isSecondary: true,
                disabled: isDirty,
                onClick: () => {
                  setIsCreatingNew(true);

                  const baseDate = new Date();
                  baseDate.setDate(baseDate.getDate() + 30); // Default to standard 30 days
                  const defaultExpiry = baseDate.toISOString().split('T')[0];

                  setFormState({
                    domain: '', is_wildcard: false, license_id: '',
                    license_type: 'standard', manual_expiry_date: defaultExpiry,
                    auto_renew: false, license_scope: 'single', installation_limit: 1
                  });
                }
              }, __('+ Add New Domain', 'vaptguard')))
            ]),
            (!isCreatingNew && (Array.isArray(domains) && domains.length > 1) ? el('div', { style: { flex: 1, minWidth: '120px' } },
              el(SelectControl, {
                value: selectedDomainId,
                options: domains.map(d => ({ label: d.domain, value: d.id })),
                onChange: (val) => { setSelectedDomainId(val); fetchData(undefined, true); },
                disabled: isSaving,
                style: { marginBottom: 0 }
              })
            ) : el('div', { style: { flex: 1, minWidth: '120px' } }))
          ]),

          el('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '15px' } }, [
            el('div', { style: { flex: 2 } }, el(TextControl, {
              label: isCreatingNew ? __('New Domain Name', 'vaptguard') : __('Domain Name (Rename)', 'vaptguard'),
              value: formState.domain,
              disabled: isSaving || formState.domain === '*',
              placeholder: formState.domain === '*' ? __('Universal — applies to any domain', 'vaptguard') : '',
              onChange: (val) => setFormState({ ...formState, domain: val }),
              style: { marginBottom: 0, background: formState.domain === '*' ? '#f1f5f9' : undefined },
              help: formState.domain === '*'
                ? __('Universal license — not locked to any specific domain.', 'vaptguard')
                : !isCreatingNew ? __('Warning: Changing this will rename the current domain.', 'vaptguard') : ''
            })
            ),

            el('div', { style: { flex: 1, minWidth: '120px' } }, el(SelectControl, {
              label: __('Domain Type', 'vaptguard'),
              value: formState.domain === '*' ? 'universal' : (formState.is_wildcard ? '1' : '0'),
              options: [
                { label: __('Standard', 'vaptguard'), value: '0' },
                { label: __('Wildcard', 'vaptguard'), value: '1' },
                { label: __('Universal (Any Domain)', 'vaptguard'), value: 'universal' }
              ],
              disabled: isSaving,
              onChange: (val) => {
                if (val === 'universal') {
                  setFormState({ ...formState, domain: '*', is_wildcard: 1 });
                } else if (formState.domain === '*') {
                  // Leaving universal mode — clear the * to let user type a real domain
                  setFormState({ ...formState, domain: '', is_wildcard: val === '1' });
                } else {
                  setFormState({ ...formState, is_wildcard: val === '1' });
                }
              },
              style: { marginBottom: 0 }
            }))
          ]),

          el('div', { style: { display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' } }, [
            el('div', { style: { flex: 1 } }, el(SelectControl, {
              label: __('License Scope', 'vaptguard'),
              value: formState.license_scope,
              options: [
                { label: __('Single Domain', 'vaptguard'), value: 'single' },
                { label: __('Multi-Site', 'vaptguard'), value: 'multisite' }
              ],
              disabled: isSaving,
              onChange: (val) => setFormState({ ...formState, license_scope: val }),
              style: { marginBottom: 0 }
            })),
            el('div', { style: { flex: '0 0 100px' } }, el(TextControl, {
              label: __('Limit', 'vaptguard'),
              type: 'number',
              min: 1,
              disabled: isSaving || formState.license_scope !== 'multisite',
              value: formState.license_scope === 'multisite' ? formState.installation_limit : 1,
              onChange: (val) => setFormState({ ...formState, installation_limit: parseInt(val) || 1 }),
              style: { marginBottom: 0 }
            })),
            el('div', { style: { flex: 2 } }, el(TextControl, {
              label: __('LICENSE ID - Unique License Identifier', 'vaptguard'),
              value: formState.license_id,
              disabled: true,
              readOnly: true,
              style: { background: '#f8fafc', color: '#64748b', marginBottom: 0 }
            }))
          ]),

          el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' } }, [
            el(SelectControl, {
              label: __('License Type', 'vaptguard'),
              value: formState.license_type,
              disabled: isSaving,
              options: [
                { label: 'Standard (30 Days)', value: 'standard' },
                { label: 'Pro (One Year)', value: 'pro' },
                { label: 'Developer (Perpetual)', value: 'developer' }
              ],
              onChange: (val) => {
                const baseDate = new Date();
                let durationDays = 30;
                if (val === 'pro') durationDays = 365;
                if (val === 'developer') durationDays = 36500;

                baseDate.setDate(baseDate.getDate() + durationDays);
                const newExpiry = baseDate.toISOString().split('T')[0];

                setFormState({
                  ...formState,
                  license_type: val,
                  manual_expiry_date: newExpiry
                });
              }
            }),

            formState.license_type !== 'developer'
              ? el(TextControl, {
                label: __('New Expiry Date', 'vaptguard'),
                type: 'date',
                value: formState.manual_expiry_date,
                disabled: isSaving,
                onChange: (val) => setFormState({ ...formState, manual_expiry_date: val })
              })
              : el(TextControl, {
                label: __('Expiry Status', 'vaptguard'),
                value: 'Perpetual License',
                readOnly: true,
                disabled: true,
                style: { background: '#f1f5f9', color: '#475569', fontStyle: 'italic' }
              })
          ]),

          el(ToggleControl, {
            label: __('Auto Renew', 'vaptguard'),
            checked: formState.license_type === 'developer' ? true : formState.auto_renew,
            disabled: isSaving || formState.license_type === 'developer',
            onChange: (val) => setFormState({ ...formState, auto_renew: val }),
            help: __('Automatically extend expiry if active.', 'vaptguard')
          }),



          el('div', { style: { display: 'flex', gap: '10px', marginTop: '20px', alignItems: 'center', flexWrap: 'wrap' } }, [
            el(Button, {
              isPrimary: true,
              isBusy: isSaving && !localStatus?.message.includes('Manual'),
              disabled: !isDirty || isSaving || !formState.domain,
              onClick: () => handleUpdate(false)
            }, isCreatingNew ? __('Register Domain & License', 'vaptguard') : __('Update License', 'vaptguard')),

            (isCreatingNew && el(Button, {
              isSecondary: true,
              disabled: isSaving,
              onClick: () => setIsCreatingNew(false)
            }, __('Cancel', 'vaptguard'))),

            (!isCreatingNew && el(Button, {
              isSecondary: true,
              isBusy: isSaving && localStatus?.message.includes('Manual'),
              disabled: formState.auto_renew || isSaving,
              onClick: () => handleUpdate(true)
            }, __('Manual Renew', 'vaptguard'))),

            (!isCreatingNew && isDirty && el(Button, {
              isDestructive: false,
              variant: 'tertiary',
              disabled: isSaving,
              style: { marginLeft: '4px' },
              onClick: () => {
                setFormState({
                  domain: currentDomain.domain || '',
                  is_wildcard: currentDomain.is_wildcard == 1,
                  license_id: currentDomain.license_id || '',
                  license_type: currentDomain.license_type || 'standard',
                  manual_expiry_date: currentDomain.manual_expiry_date ? currentDomain.manual_expiry_date.split(' ')[0] : '',
                  auto_renew: currentDomain.auto_renew == 1,
                  license_scope: currentDomain.license_scope || 'single',
                  installation_limit: currentDomain.installation_limit || 1
                });
                setLocalStatus(null);
              }
            }, __('Cancel Edits', 'vaptguard'))),

            (!isCreatingNew && currentDomain.renewals_count > 0) && el('div', { className: 'vapt-correction-controls' }, [
              el(Button, {
                className: 'is-link',
                onClick: () => handleRollback('undo')
              }, __('Undo Last', 'vaptguard')),
              el(Button, {
                className: 'is-link is-destructive',
                onClick: () => handleRollback('reset')
              }, __('Reset Renewals', 'vaptguard'))
            ])
          ])
        ])
      ]), // End Grid

      // BOTTOM: Domains List Table (Full Width)
      el('div', { className: 'vapt-license-table-wrap', style: { marginTop: '30px', width: '100%', borderTop: '1px solid #ddd', paddingTop: '30px' } }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } }, [
          el('h3', { style: { margin: 0 } }, __('Domain License Directory', 'vaptguard')),
          el('div', { style: { width: '300px' } }, [
            el(TextControl, {
              placeholder: __('Search domains...', 'vaptguard'),
              value: searchQuery,
              onChange: (val) => setSearchQuery(val),
              style: { marginBottom: 0 }
            })
          ])
        ]),
        el('table', { className: 'wp-list-table widefat fixed striped' }, [
          el('thead', null, el('tr', null, [
            el('th', {
              className: `manage-column sortable ${sortBy === 'license_id' ? 'sorted ' + sortOrder : ''}`,
              onClick: () => toggleSort('license_id'),
              style: { cursor: 'pointer', width: '180px', paddingRight: '10px' }
            }, [
              el('span', null, __('License ID', 'vaptguard')),
              el('span', { className: 'sorting-indicator' })
            ]),
            el('th', {
              className: `manage-column sortable ${sortBy === 'installation_limit' ? 'sorted ' + sortOrder : ''}`,
              onClick: () => toggleSort('installation_limit'),
              style: { cursor: 'pointer', width: '20%', paddingRight: '10px' }
            }, [
              el('span', null, __('Usage', 'vaptguard')),
              el('span', { className: 'sorting-indicator' })
            ]),
            el('th', {
              className: `manage-column column-primary sortable ${sortBy === 'domain' ? 'sorted ' + sortOrder : ''}`,
              onClick: () => toggleSort('domain'),
              style: { cursor: 'pointer', width: 'auto', paddingRight: '10px' }
            }, [
              el('span', null, __('Domain', 'vaptguard')),
              el('span', { className: 'sorting-indicator' })
            ]),
            el('th', {
              className: `manage-column sortable ${sortBy === 'version' ? 'sorted ' + sortOrder : ''}`,
              onClick: () => toggleSort('version'),
              style: { cursor: 'pointer', width: '70px', paddingRight: '10px' }
            }, [
              el('span', null, __('Version', 'vaptguard')),
              el('span', { className: 'sorting-indicator' })
            ]),
            el('th', {
              className: `manage-column sortable ${sortBy === 'license_type' ? 'sorted ' + sortOrder : ''}`,
              onClick: () => toggleSort('license_type'),
              style: { cursor: 'pointer', width: '100px', paddingRight: '10px' }
            }, [
              el('span', null, __('License', 'vaptguard')),
              el('span', { className: 'sorting-indicator' })
            ]),
            el('th', {
              className: `manage-column sortable ${sortBy === 'first_activated_at' ? 'sorted ' + sortOrder : ''}`,
              onClick: () => toggleSort('first_activated_at'),
              style: { cursor: 'pointer', width: '120px', paddingRight: '10px' }
            }, [
              el('span', null, __('Activated At', 'vaptguard')),
              el('span', { className: 'sorting-indicator' })
            ]),
            el('th', {
              className: `manage-column sortable ${sortBy === 'manual_expiry_date' ? 'sorted ' + sortOrder : ''}`,
              onClick: () => toggleSort('manual_expiry_date'),
              style: { cursor: 'pointer', width: '120px', paddingRight: '10px' }
            }, [
              el('span', null, __('Expiry', 'vaptguard')),
              el('span', { className: 'sorting-indicator' })
            ]),
            el('th', { style: { width: '80px' } }, __('Renewals', 'vaptguard')),
            el('th', { style: { width: '140px', textAlign: 'right' } }, __('Action', 'vaptguard')),
          ])),
          el('tbody', null, sortedDomains.length === 0 ? el('tr', null, el('td', { colSpan: 8 }, __('No domains found.', 'vaptguard'))) :
            sortedDomains.sort((a, b) => {
              if (sortBy === 'license_id') return sortOrder === 'asc' ? (a.license_id || '').localeCompare(b.license_id || '') : (b.license_id || '').localeCompare(a.license_id || '');
              if (sortBy === 'domain') return sortOrder === 'asc' ? a.domain.localeCompare(b.domain) : b.domain.localeCompare(a.domain);
              if (sortBy === 'license_type') return sortOrder === 'asc' ? (a.license_type || '').localeCompare(b.license_type || '') : (b.license_type || '').localeCompare(a.license_type || '');
              if (sortBy === 'installation_limit') return sortOrder === 'asc' ? (parseInt(a.installation_limit) || 1) - (parseInt(b.installation_limit) || 1) : (parseInt(b.installation_limit) || 1) - (parseInt(a.installation_limit) || 1);
              if (sortBy === 'first_activated_at') {
                if (!a.first_activated_at) return sortOrder === 'asc' ? 1 : -1;
                if (!b.first_activated_at) return sortOrder === 'asc' ? -1 : 1;
                if (a.first_activated_at < b.first_activated_at) return sortOrder === 'asc' ? -1 : 1;
                if (a.first_activated_at > b.first_activated_at) return sortOrder === 'asc' ? 1 : -1;
                return 0;
              }
              if (sortBy === 'manual_expiry_date') {
                if (!a.manual_expiry_date) return sortOrder === 'asc' ? 1 : -1;
                if (!b.manual_expiry_date) return sortOrder === 'asc' ? -1 : 1;
                if (a.manual_expiry_date < b.manual_expiry_date) return sortOrder === 'asc' ? -1 : 1;
                if (a.manual_expiry_date > b.manual_expiry_date) return sortOrder === 'asc' ? 1 : -1;
                return 0;
              }
              if (sortBy === 'version') {
                const vA = a.version || '1.0.0';
                const vB = b.version || '1.0.0';
                if (vA < vB) return sortOrder === 'asc' ? -1 : 1;
                if (vA > vB) return sortOrder === 'asc' ? 1 : -1;
                return 0;
              }
              return 0;
            }).map((dom) => el('tr', { key: dom.id, className: dom.id == selectedDomainId ? 'is-selected' : '' }, [
              el('td', { style: { width: '180px', paddingRight: '10px' } }, el('span', { style: { fontFamily: 'monospace', fontSize: '11px', color: '#64748b' } }, dom.license_id || '-')),
              el('td', { style: { width: '20%', paddingRight: '10px' } }, (dom.license_id) ? (() => {
                const count = licenseUsage[dom.license_id] || 0;
                const limit = parseInt(dom.installation_limit) || 1;
                const percent = Math.min(100, Math.round((count / limit) * 100));
                const status = percent >= 90 ? 'danger' : (percent >= 70 ? 'warning' : 'safe');
                return el('div', { className: 'vapt-usage-directory-wrapper' }, [
                  el('span', { className: 'vapt-usage-count', style: { color: percent >= 90 ? '#ef4444' : '#1e293b' } }, `${count} / ${limit}`),
                  limit > 1 && el('div', { className: 'vapt-usage-bar-bg', style: { flex: 1, margin: 0 } }, [
                    el('div', { className: `vapt-usage-bar-fill ${status}`, style: { width: `${percent}%` } })
                  ]),
                  limit > 1 && el('span', { className: 'vapt-usage-percent' }, `${percent}%`),
                  el('span', { className: 'dashicons dashicons-admin-users vapt-usage-icon' })
                ]);
              })() : '-'),
              el('td', { className: 'column-primary', style: { paddingRight: '10px' } }, [
                el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
                  el('span', { className: 'dashicons dashicons-networking', style: { color: '#64748b', fontSize: '16px', width: '16px', height: '16px' } }),
                  el('strong', null, dom.domain),
                  (dom.is_wildcard == 1) && el('span', { className: 'vapt-license-badge', style: { marginLeft: '4px', background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', fontSize: '9px', padding: '1px 5px' } }, __('Wildcard', 'vaptguard')),
                ]),
                el('button', { type: 'button', className: 'toggle-row' }, el('span', { className: 'screen-reader-text' }, __('Show more details', 'vaptguard')))
              ]),
              el('td', { style: { fontWeight: '500', color: '#475569', paddingRight: '10px' } }, dom.version || '1.0.0'),
              el('td', { style: { paddingRight: '10px' } }, el('span', { className: `vapt-license-badge ${dom.license_type || 'standard'}` }, (dom.license_type || 'Standard').toUpperCase())),
              el('td', { style: { paddingRight: '10px' } }, dom.first_activated_at ? formatDate(dom.first_activated_at) : '-'),
              el('td', { style: { paddingRight: '10px' } }, dom.license_type === 'developer' ? __('Never', 'vaptguard') : (dom.manual_expiry_date ? formatDate(dom.manual_expiry_date) : '-')),
              el('td', { style: { paddingRight: '10px' } }, `${dom.renewals_count || 0} `),
              el('td', { style: { textAlign: 'right' } }, el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' } }, [
                el('button', {
                  className: `vapt-status-pill-btn ${(dom.is_enabled === '0' || dom.is_enabled === 0 || dom.is_enabled === false) ? 'inactive' : 'active'}`,
                  style: (dom.is_enabled !== '0' && dom.is_enabled !== 0 && dom.is_enabled !== false) ? { background: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0', padding: '4px 10px' } : { padding: '4px 10px' },
                  onClick: () => {
                    const nextState = (dom.is_enabled === '0' || dom.is_enabled === 0 || dom.is_enabled === false) ? 1 : 0;
                    addDomain(dom.domain, dom.is_wildcard, nextState, dom.id);
                  }
                }, [
                  el('span', { className: `dashicons dashicons-${(dom.is_enabled === '0' || dom.is_enabled === 0 || dom.is_enabled === false) ? 'no-alt' : 'yes'}`, style: { fontSize: '14px', marginRight: '4px' } }),
                  (dom.is_enabled === '0' || dom.is_enabled === 0 || dom.is_enabled === false) ? __('INACTIVE', 'vaptguard') : __('ACTIVE', 'vaptguard')
                ]),
                el(Tooltip, { text: __('Delete Domain License', 'vaptguard') },
                  el('button', {
                    className: 'vapt-elite-action-btn delete',
                    style: { color: '#94a3b8', background: 'none', border: 'none', padding: 0 },
                    disabled: deletingId === dom.id,
                    onClick: () => {
                      globalSetConfirmState({
                        isOpen: true,
                        type: 'delete_license',
                        message: __('Are you sure you want to delete this domain license entirely?', 'vaptguard'),
                        isDestructive: true,
                        onConfirm: () => { deleteDomain(dom.id); globalSetConfirmState(null); }
                      });
                    }
                  }, el('span', { className: `dashicons dashicons-${deletingId === dom.id ? 'update' : 'trash'}`, style: { fontSize: '18px' } }))
                ),
                el(Tooltip, { text: __('Invalidate License', 'vaptguard') },
                  el('button', {
                    className: 'vapt-elite-action-btn',
                    style: { color: '#94a3b8', background: 'none', border: 'none', padding: 0 },
                    disabled: !dom.manual_expiry_date,
                    onClick: () => {
                      globalSetConfirmState({
                        isOpen: true,
                        type: 'invalidate_license',
                        message: __('Are you sure you want to invalidate this license? This will instantly trigger the kill-switch on the client side.', 'vaptguard'),
                        isDestructive: true,
                        onConfirm: () => {
                          apiFetch({
                            path: 'vaptguard/v1/domains/update',
                            method: 'POST',
                            data: { id: dom.id, action: 'invalidate' }
                          }).then(() => {
                            fetchData();
                            globalSetConfirmState(null);
                          });
                        }
                      });
                    }
                  }, el('span', { className: 'dashicons dashicons-lock', style: { fontSize: '18px' } }))
                )
              ]))
            ]))
          )
        ])
      ]),

      // Confirmation Modal
      el(vaptguard_ConfirmModal, {
        isOpen: confirmState.isOpen,
        message: confirmState.type === 'undo'
          ? __('Are you sure you want to undo the last manual renewal?', 'vaptguard')
          : __('Are you sure you want to reset all consecutive manual renewals?', 'vaptguard'),
        onConfirm: executeRollback,
        onCancel: () => setConfirmState({ isOpen: false, type: null }),
        confirmLabel: __('Revert Now', 'vaptguard'),
        isDestructive: confirmState.type === 'reset'
      })
    ]);
  };

  // Helper to resolve nested paths based on field mapping
  const resolvePath = (obj, path) => {
    if (!path) return undefined;
    return path.split('.').reduce((prev, curr) => (prev && prev[curr] !== undefined) ? prev[curr] : undefined, obj);
  };

  // Helper to extract granular content based on mapping or fallback
  const getMappedContent = (obj, mappingKey, fallbackKey, fieldMapping) => {
    if (fieldMapping && fieldMapping[mappingKey]) {
      const mapped = resolvePath(obj, fieldMapping[mappingKey]);
      if (mapped) return mapped;
    }
    // Fallback to direct property
    return obj[fallbackKey];
  };

  const generateDevInstructions = (f, fieldMapping = {}) => {
    if (!f) return '';

    const id = f.risk_id || f.key || 'N/A';
    const title = f.title || f.label || 'N/A';
    const severity = (typeof f.severity === 'object') ? (f.severity.level || 'Medium') : (f.severity || 'Medium');
    const priority = f.priority || 'Medium';

    // Mapped Fields Extraction for instructions
    const mappedDesc = getMappedContent(f, 'description', 'description', fieldMapping);
    const summary = (typeof mappedDesc === 'object' ? mappedDesc.summary : mappedDesc) || 'No core description available.';
    const mappedUiLayout = getMappedContent(f, 'ui_layout', 'ui_layout', fieldMapping);
    const mappedComponents = getMappedContent(f, 'components', 'components', fieldMapping);
    const mappedActions = getMappedContent(f, 'actions', 'actions', fieldMapping);
    const mappedAvailablePlatforms = getMappedContent(f, 'available_platforms', 'available_platforms', fieldMapping);

    // Driver Detection (Skill Alignment)
    const targets = f.protection?.automated_protection?.implementation_targets || f.available_platforms || [];
    let detectedDriver = 'Manual / Hook (default)';
    let safetyRules = [];
    let targetFiles = [];
    let driverKey = '';

    const selection = f.active_enforcer;

    if (selection) {
      const selLower = selection.toLowerCase();
      if (selLower.includes('htaccess') || selLower === 'apache' || selLower === 'litespeed') {
        detectedDriver = '.htaccess (Apache Core)';
        driverKey = 'htaccess';
        targetFiles = ['{ABSPATH}.htaccess'];
        safetyRules = [
          'Always use `# BEGIN VAPT {ID}` and `# END VAPT {ID}` markers.',
          'Place RewriteRules BEFORE the `# BEGIN WordPress` block to ensure they execute.',
          'Use `[L,F]` for blocking rules.',
          'No forbidden directives (`TraceEnable`, `ServerSignature`, `<Directory>`).',
          'Wrap rewrites in `<IfModule mod_rewrite.c>` with `RewriteEngine On`.'
        ];
      }
      else if (selLower.includes('wp-config')) {
        detectedDriver = 'wp-config.php Constants';
        driverKey = 'wp_config';
        targetFiles = ['{ABSPATH}wp-config.php'];
        safetyRules = [
          'Always use `/* BEGIN VAPT {ID} */` and `/* END VAPT {ID} */` markers.',
          'Place constants BEFORE the `/* That\'s all, stop editing! */` line (before_wp_settings).',
          'Check if constant is already defined before defining it.',
          'Use correct boolean or string values as required by WP core.'
        ];
      }
      else if (selLower.includes('functions') || selLower.includes('hook') || selLower === 'wordpress' || selLower === 'php') {
        detectedDriver = 'WordPress / PHP Hook';
        driverKey = 'php_functions';
        targetFiles = ['{ABSPATH}wp-content/plugins/vapt-protection-suite/vapt-functions.php'];
        safetyRules = [
          'Always use `// BEGIN VAPT {ID}` and `// END VAPT {ID}` markers.',
          'Use specific WordPress action or filter hooks.',
          'Prefix all functions with `vapt_` (e.g. `vapt_disable_xmlrpc`).',
          'Insert at the end of the file (`functions_php`).'
        ];
      }
      else if (selLower === 'fail2ban') {
        detectedDriver = 'Fail2Ban Jail';
        driverKey = 'fail2ban';
        targetFiles = ['/etc/fail2ban/jail.local', '/etc/fail2ban/filter.d/...'];
        safetyRules = ['Use `# BEGIN VAPT {ID}` markers.', 'Always include `fail2ban-client reload` in verification.'];
      }
      else if (selLower === 'nginx') {
        detectedDriver = 'Nginx Conf';
        driverKey = 'nginx';
        targetFiles = ['/etc/nginx/conf.d/vapt-security.conf'];
        safetyRules = ['Use `# BEGIN VAPT {ID}` markers.', 'Ensure insertion is after `http {` loop.', 'Include `nginx -t` validation.'];
      }
      else if (selLower === 'cloudflare') {
        detectedDriver = 'Cloudflare (Pattern 4)';
        driverKey = 'cloudflare';
        targetFiles = ['Cloudflare Dashboard / API via WAF Rules'];
      }
      else if (selLower === 'iis') {
        detectedDriver = 'IIS / web.config (Pattern 5)';
        driverKey = 'iis';
        targetFiles = ['{ABSPATH}web.config'];
        safetyRules = ['Use `<rule>` formatting inside `<rewrite>`.', 'Ensure URL Rewrite module exists.'];
      }
      else if (selLower === 'caddy') {
        detectedDriver = 'Caddy (Pattern 6)';
        driverKey = 'caddy';
        targetFiles = ['/etc/caddy/Caddyfile'];
        safetyRules = ['Use Caddy v2 syntax.', 'Ensure `caddy reload` is included in verification.'];
      }
    } else if (targets.includes('.htaccess')) {
      detectedDriver = '.htaccess (Apache Core)';
      driverKey = 'htaccess';
      targetFiles = ['{ABSPATH}.htaccess'];
      safetyRules = [
        'Always use `# BEGIN VAPT {ID}` and `# END VAPT {ID}` markers.',
        'Place RewriteRules BEFORE the `# BEGIN WordPress` block to ensure they execute.',
        'Use `[L,F]` for blocking rules.',
        'No forbidden directives (`TraceEnable`, `ServerSignature`, `<Directory>`).',
        'Wrap rewrites in `<IfModule mod_rewrite.c>` with `RewriteEngine On`.'
      ];
    }
    else if (targets.includes('wp-config.php')) {
      detectedDriver = 'wp-config.php Constants';
      driverKey = 'wp_config';
      targetFiles = ['{ABSPATH}wp-config.php'];
      safetyRules = [
        'Always use `/* BEGIN VAPT {ID} */` and `/* END VAPT {ID} */` markers.',
        'Place constants BEFORE the `/* That\'s all, stop editing! */` line (before_wp_settings).',
        'Check if constant is already defined before defining it.',
        'Use correct boolean or string values as required by WP core.'
      ];
    }
    else if (targets.includes('PHP Hook') || targets.includes('WordPress') || targets.includes('PHP Functions') || targets.includes('WordPress Core')) {
      detectedDriver = 'WordPress / PHP Hook';
      driverKey = 'php_functions'; // Canonical key
      targetFiles = ['{ABSPATH}wp-content/plugins/vapt-protection-suite/vapt-functions.php'];
      safetyRules = [
        'Always use `// BEGIN VAPT {ID}` and `// END VAPT {ID}` markers.',
        'Use specific WordPress action or filter hooks.',
        'Prefix all functions with `vapt_` (e.g. `vapt_disable_xmlrpc`).',
        'Insert at the end of the file (`functions_php`).'
      ];
    }
    else if (targets.includes('fail2ban')) {
      detectedDriver = 'Fail2Ban Jail';
      driverKey = 'fail2ban';
      targetFiles = ['/etc/fail2ban/jail.local', '/etc/fail2ban/filter.d/...'];
      safetyRules = ['Use `# BEGIN VAPT {ID}` markers.', 'Always include `fail2ban-client reload` in verification.'];
    }
    else if (targets.includes('Nginx')) {
      detectedDriver = 'Nginx Conf';
      driverKey = 'nginx';
      targetFiles = ['/etc/nginx/conf.d/vapt-security.conf'];
      safetyRules = ['Use `# BEGIN VAPT {ID}` markers.', 'Ensure insertion is after `http {` loop.', 'Include `nginx -t` validation.'];
    }
    else if (targets.includes('Cloudflare')) {
      detectedDriver = 'Cloudflare (Pattern 4)';
      targetFiles = ['Cloudflare Dashboard / API via WAF Rules'];
    }
    else if (targets.includes('IIS')) {
      detectedDriver = 'IIS / web.config (Pattern 5)';
      targetFiles = ['{ABSPATH}web.config'];
      safetyRules = ['Use `<rule>` formatting inside `<rewrite>`.', 'Ensure URL Rewrite module exists.'];
    }
    else if (targets.includes('Caddy')) {
      detectedDriver = 'Caddy (Pattern 6)';
      targetFiles = ['/etc/caddy/Caddyfile'];
      safetyRules = ['Use Caddy v2 syntax.', 'Ensure `caddy reload` is included in verification.'];
    }

    const hasMappingRules = mappedUiLayout || mappedComponents || mappedActions;

    const lines = [
      `# VAPT Implementation Brief v2.0 (Schema-First)`,
      `**Risk**: ${id} (${title})`,
      `**Severity**: ${severity} | **Priority**: ${priority}`,
      ``,
      `## 0. Core Principle: Preserve Core Functionality`,
      `- **Whitelisting**: You MUST ensure that all security rules explicitly whitelist or preserve access to:`,
      `    - WordPress Admin (\`/wp-admin/\`, \`admin-ajax.php\`)`,
      `    - REST API Endpoints (\`/wp-json/\`)`,
      `    - JSON core endpoints.`,
      `- Failure to do this will result in a site lockout. Site availability is the top priority.`,
      ``,
      `## 🛡️ Strategic Mandate (Schema-First v2.0)`,
      `- **Goal**: ${summary}`,
      `- **Primary Driver**: ${detectedDriver}`,
      `- **Rulebook**: Ingest \`ai_agent_instructions_v2.0.json\`.`,
      `- **Blueprint**: Look up \`${id}\` in \`interface_schema_v2.0.json\`.`,
      `- **Pattern matching**: Map \`lib_key\` to \`enforcer_pattern_library_v2.0.json\`.`,
      ``,
      `## 🎚️ Toggle Intelligence`,
      `- **Control**: Check \`feat_enabled\` state for all enforcement code.`,
      `- **Conditional Logic**: Inject full blocks if enabled; comment out/remove if disabled.`,
      `- **Markers**: Always use VAPT markers (BEGIN/END) for all injections.`,
      `## 🧩 User Interface Requirements`,
      ...(hasMappingRules ? [
        `You MUST strictly adhere to the mapped UI Schema references provided in the Context data:`,
        ...(mappedUiLayout ? [`- **Layout**: Apply the exact section, order, and collapsible rules from the \`ui_layout\` object.`] : []),
        ...(mappedComponents ? [`- **Components**: Emit EXACTLY the arrays of components specified, replicating component IDs (\`UI-RISK-...-...\`) and handler names.`] : []),
        ...(mappedActions ? [`- **Actions**: Emit EXACTLY the listed actions, matching the REST endpoints and action IDs.`] : []),
        ...(mappedAvailablePlatforms ? [`- **Platforms**: Only render implementation components for platforms listed in \`available_platforms\`.`] : [])
      ] : [
        `- Adhere to standard UI component naming conventions (\`UI-RISK-{NNN}-{SEQ}\`).`,
        `- Construct standard form layouts per v2.0 guidelines.`
      ]),
      ``,
      `## 📁 Target Configuration Files`,
      `Ensure that the suggested protection configurations are specifically targeted to be written/appended within exactly these files:`,
      ...targetFiles.map(file => `- \`${file}\``),
      ``,
      `## ⚠️ Targeted Safety Guidelines`,
      ...(safetyRules.length > 0 ? safetyRules.map(rule => `- ${rule}`) : [`- Follow standard WordPress security best practices.`]),
      ``,
      `## 📋 Self-Check & Rubric (Completion Standards)`,
      `- **Develop Phase**: Minimum Score **16/19**.`,
      `- **Deploy Phase**: Minimum Score **18/19** (Governed by \`/develop-to-deploy\` workflow).`,
      ``,
      `> [!IMPORTANT]`,
      `> This brief follows the **VAPT v2.0 Schema First Architecture**. You MUST prioritize **Whitelisting** and follow the **Transition to Develop** sequence.`
    ];

    // Overlay custom user instructions if any existed previously
    if (f.dev_instruct && !f.dev_instruct.startsWith('# VAPT Implementation Brief')) {
      lines.push(``, `## 📝 Custom/Legacy Guidance`, f.dev_instruct);
    }

    return lines.join('\n');
  };

  const FeatureList = ({
    features, schema, updateFeature, loading, dataFiles, selectedFile, onSelectFile, onUpload, allFiles, hiddenFiles, onUpdateHiddenFiles, manageSourcesStatus, isManageModalOpen, setIsManageModalOpen, onRemoveFile, designPromptConfig, setDesignPromptConfig,
    historyFeature, setHistoryFeature, designFeature, setDesignFeature, transitioning, setTransitioning, isPromptConfigModalOpen, setIsPromptConfigModalOpen, isMappingModalOpen, setIsMappingModalOpen,
    sortBySource, setSortBySource, sortSourceDirection, setSortSourceDirection,
    environmentProfile
  }) => {
    const [confirmingFile, setConfirmingFile] = useState(null);
    // Default column order and visible columns - will be overridden by API data if available
    const [columnOrder, setColumnOrder] = useState(['RiskID', 'id', 'name', 'category', 'severity', 'owasp', 'test_method', 'verification_steps', 'remediation', 'description']);
    const [visibleCols, setVisibleCols] = useState(['RiskID', 'id', 'name', 'category', 'severity', 'owasp', 'test_method', 'verification_steps', 'remediation', 'description']);
    const [colPrefsLoaded, setColPrefsLoaded] = useState(false);

    // Load column preferences from WordPress Options Table via API
    useEffect(() => {
      const loadColumnPreferences = async () => {
        try {
          const response = await apiFetch({ path: 'vaptguard/v1/column-preferences' });
          if (response && response.column_order && response.visible_cols) {
            vaptLog.log('Loaded column preferences from API:', response);
            setColumnOrder(response.column_order);
            setVisibleCols(response.visible_cols);
          } else {
            vaptLog.log('No saved column preferences found, using defaults');
          }
        } catch (error) {
          vaptLog.error('Failed to load column preferences:', error);
        } finally {
          setColPrefsLoaded(true);
        }
      };
      loadColumnPreferences();
    }, []);

    // Effective columns to show in table
    const activeCols = columnOrder.filter(c => visibleCols.includes(c));

    // Save column preferences to WordPress Options Table via API
    useEffect(() => {
      if (!colPrefsLoaded) return; // Don't save until we've loaded initial preferences

      const saveColumnPreferences = async () => {
        try {
          await apiFetch({
            path: 'vaptguard/v1/column-preferences',
            method: 'POST',
            data: {
              column_order: columnOrder,
              visible_cols: visibleCols
            }
          });
          vaptLog.log('Saved column preferences to API');
        } catch (error) {
          vaptLog.error('Failed to save column preferences:', error);
        }
      };
      saveColumnPreferences();
    }, [columnOrder, visibleCols, colPrefsLoaded]);

    const [filterStatus, setFilterStatus] = useState(() => localStorage.getItem('vaptguard_filter_status') || 'all');
    const [selectedCategories, setSelectedCategories] = useState(() => {
      const saved = localStorage.getItem('vaptguard_selected_categories');
      return saved ? JSON.parse(saved) : [];
    });

    // Local Save Status for Columns
    const [colSaveStatus, setColSaveStatus] = useState(null);

    // Drag and Drop State
    const [draggedCol, setDraggedCol] = useState(null);

    const handleDragStart = (e, col) => {
      setDraggedCol(col);
      e.dataTransfer.effectAllowed = 'move';
      // e.target.style.opacity = '0.5'; 
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, targetCol) => {
      e.preventDefault();
      if (draggedCol === targetCol) return;

      const newOrder = [...columnOrder];
      const draggedIdx = newOrder.indexOf(draggedCol);
      const targetIdx = newOrder.indexOf(targetCol);

      newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, draggedCol);

      setColumnOrder(newOrder);
      setDraggedCol(null);
    };

    const [selectedSeverities, setSelectedSeverities] = useState(() => {
      const saved = localStorage.getItem('vaptguard_selected_severities');
      return saved ? JSON.parse(saved) : [];
    });
    const [sortBy, setSortBy] = useState(() => localStorage.getItem('vaptguard_sort_by') || 'name');
    const [sortOrder, setSortOrder] = useState(() => localStorage.getItem('vaptguard_sort_order') || 'asc');
    const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('vaptguard_search_query') || '');
    const [fieldMapping, setFieldMapping] = useState({ test_method: '', verification_steps: '', verification_command: '', verification_expected: '', verification_engine: '' });


    // Load/Save Field Mapping per File
    useEffect(() => {
      if (!selectedFile) return;
      const saved = localStorage.getItem(`vaptguard_field_mapping_${selectedFile}`);
      if (saved) {
        setFieldMapping(JSON.parse(saved));
      } else {
        setFieldMapping({ test_method: '', verification_steps: '', verification_command: '', verification_expected: '', verification_engine: '' });
      }
    }, [selectedFile]);

    useEffect(() => {
      if (!selectedFile) return;
      localStorage.setItem(`vaptguard_field_mapping_${selectedFile}`, JSON.stringify(fieldMapping));
    }, [fieldMapping, selectedFile]);

    const toggleSort = (key) => {
      if (sortBy === key) {
        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        setSortBy(key);
        setSortOrder('asc');
      }
    };

    // Persist filters
    useEffect(() => {
      localStorage.setItem('vaptguard_filter_status', filterStatus);
      localStorage.setItem('vaptguard_selected_categories', JSON.stringify(selectedCategories));
      localStorage.setItem('vaptguard_selected_severities', JSON.stringify(selectedSeverities));
      localStorage.setItem('vaptguard_sort_by', sortBy);
      localStorage.setItem('vaptguard_sort_order', sortOrder);
      localStorage.setItem('vaptguard_search_query', searchQuery);
    }, [filterStatus, selectedCategories, selectedSeverities, sortBy, sortOrder, searchQuery]);

    const [saveStatus, setSaveStatus] = useState(null); // Feedback for media/clipboard uploads

    // confirmTransition moved to VAPTAdmin to avoid modal flicker when state updates


    // Smart Toggle Handling
    const handleSmartToggle = (feature, toggleKey) => {
      const getNestedValue = (obj, path) => {
        return path?.split('.').reduce((acc, part) => acc && acc[part], obj);
      };

      const newVal = !feature[toggleKey];
      let updates = { [toggleKey]: newVal ? 1 : 0 }; // Ensure 1/0 for DB compatibility

      if (newVal) {
        let contentField = null;
        let mappingKey = null;

        if (toggleKey === 'include_test_method') {
          contentField = 'test_method'; mappingKey = 'test_method';
        } else if (toggleKey === 'include_verification') {
          contentField = 'verification_steps'; mappingKey = 'verification_steps';
        } else if (toggleKey === 'include_verification_engine') {
          contentField = 'generated_schema'; mappingKey = 'verification_engine';
        }

        if (contentField && mappingKey && fieldMapping[mappingKey]) {
          // Check if destination is effectively empty
          let isEmpty = !feature[contentField];
          if (Array.isArray(feature[contentField]) && feature[contentField].length === 0) isEmpty = true;
          if (typeof feature[contentField] === 'object' && feature[contentField] !== null && Object.keys(feature[contentField]).length === 0) isEmpty = true;
          // Special check for schema with empty controls
          if (contentField === 'generated_schema' && feature[contentField]?.controls?.length === 0) isEmpty = true;

          if (isEmpty) {
            const sourceKey = fieldMapping[mappingKey];
            let sourceVal = getNestedValue(feature, sourceKey);
            if (sourceVal) {
              if (contentField === 'generated_schema' && typeof sourceVal === 'string') {
                try { sourceVal = JSON.parse(sourceVal); } catch (e) {
                  vaptLog.warn('Failed to parse source JSON for mapping', e);
                }
              }
              updates[contentField] = sourceVal;
              vaptLog.log(`Smart Mapping populated ${contentField} from ${sourceKey} `);
            }
          }
        }
      }
      updateFeature(feature.key || feature.id, updates);
    };

    // 1. Analytics (Moved below filtering for scope)

    // 2. Extract Categories & Severities & All Keys
    const safeFeatures = Array.isArray(features) ? features : [];
    const categories = [...new Set(safeFeatures.map(f => f.category))].filter(Boolean).sort();
    const severities = [...new Set(safeFeatures.map(f => f.severity))].filter(Boolean);
    const severityOrder = ['critical', 'high', 'medium', 'low', 'informational'];
    const uniqueSeverities = [...new Set(severities.map(s => s.toLowerCase()))]
      .sort((a, b) => severityOrder.indexOf(a) - severityOrder.indexOf(b))
      .map(s => {
        const map = {
          'critical': 'Critical',
          'high': 'High',
          'medium': 'Medium',
          'low': 'Low',
          'informational': 'Informational'
        };
        return map[s] || (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
      });

    // Collect all available keys from features data - restricted to fields present in data file
    const allKeys = ['RiskID', 'id', 'name', 'description', 'category', 'severity', 'owasp', 'test_method', 'verification_steps', 'remediation'];

    const resolveEnforcer = (feature) => {
      const platforms = feature.platform_implementations || {};

      // Fallback: If environment profile not loaded, use default capabilities
      const optimal = environmentProfile?.optimal_platform || 'php_functions';
      const capabilities = environmentProfile?.capabilities || {
        // Default capabilities when profile not loaded - enable all platforms
        php: true,
        apache: true,
        nginx: true,
        cloudflare_proxy: true,
        iis: true,
        caddy: true,
        wordpress: true,
        mod_rewrite: true,
        allowoverride: true
      };

      // Enhanced compatibility map with priority scores and platform mapping
      // Includes ALL platform names found in interface_schema_v2.0.json
      const compatibilityMap = {
        'apache_htaccess': {
          enforcers: ['.htaccess', 'Apache', 'Litespeed', 'OpenLiteSpeed'],
          priority: 90, // High priority - most effective
          requirements: ['mod_rewrite', 'AllowOverride']
        },
        'nginx_config': {
          enforcers: ['Nginx', 'Nginx'],
          priority: 85, // High priority - excellent performance
          requirements: ['nginx.conf writable']
        },
        'iis_config': {
          enforcers: ['IIS', 'IIS'],
          priority: 80, // Medium priority - good for Windows hosting
          requirements: ['web.config writable']
        },
        'php_functions': {
          enforcers: ['PHP Functions', 'WordPress', 'WordPress Core', 'wp-config.php'],
          priority: 70, // Lower priority - universal fallback
          requirements: ['PHP execution']
        },
        'cloudflare_edge': {
          enforcers: ['Cloudflare', 'Cloudflare'],
          priority: 100, // Highest priority - edge blocking
          requirements: ['api_token']
        },
        'server_cron': {
          enforcers: ['Server Cron', 'Server Cron'],
          priority: 60, // Low priority - background tasks only
          requirements: ['crontab access']
        },
        'caddy_native': {
          enforcers: ['Caddy', 'Caddy'],
          priority: 85, // High priority - modern server
          requirements: ['Caddyfile writable']
        },
        'fail2ban': {
          enforcers: ['fail2ban', 'fail2ban'],
          priority: 75, // Medium priority - IP blocking
          requirements: ['jail.local writable']
        }
      };

      // 1. Get ALL supported enforcers for this feature
      const availableEnforcers = new Set();

      // Add from platform_implementations (primary source)
      if (platforms && typeof platforms === 'object') {
        Object.keys(platforms).forEach(k => {
          if (k && typeof k === 'string') {
            availableEnforcers.add(k);
          }
        });
      }

      // Also check for enforcer in steps (legacy support)
      if (feature.steps && Array.isArray(feature.steps)) {
        feature.steps.forEach(s => {
          if (s.enforcer && typeof s.enforcer === 'string') {
            availableEnforcers.add(s.enforcer);
          }
        });
      }

      // Enhanced debug logging
      vaptLog.log(`Resolving enforcer for ${feature.key || feature.id}`, {
        capabilities,
        compatibilityMap,
        platformImplementations: feature.platform_implementations,
        availableEnforcers: Array.from(availableEnforcers),
        featureData: feature
      });

      if (availableEnforcers.size === 0) {
        vaptLog.warn(`No enforcers found for feature ${feature.key || feature.id}`);
      }

      // 2. Filter by environment compatibility (only if we have valid capabilities)
      // Define capability mapping outside the callback
      const capabilityToMap = {
        'php': 'php_functions',
        'apache': 'apache_htaccess',
        'nginx': 'nginx_config',
        'cloudflare_proxy': 'cloudflare_edge',
        'iis': 'iis_config',
        'caddy': 'caddy_native',
        'wordpress': 'php_functions',
        'mod_rewrite': 'apache_htaccess',
        'allowoverride': 'apache_htaccess',
        // Add fallback mappings for all platform names
        'nginx_config': 'nginx_config',
        'apache_htaccess': 'apache_htaccess',
        'iis_config': 'iis_config',
        'php_functions': 'php_functions',
        'cloudflare_edge': 'cloudflare_edge',
        'server_cron': 'server_cron',
        'caddy_native': 'caddy_native',
        'fail2ban': 'fail2ban'
      };

      const compatibleEnforcers = Array.from(availableEnforcers).filter(enf => {
        // If no environment profile loaded, return ALL enforcers without filtering
        if (!environmentProfile) {
          return true;
        }

        const enfLower = enf.toLowerCase();
        return Object.entries(capabilities).some(([cap, enabled]) => {
          if (!enabled) return false;

          const mapKey = capabilityToMap[cap] || cap;
          const platformConfig = compatibilityMap[mapKey];
          if (!platformConfig) return false;
          const compatibleList = platformConfig.enforcers || [];
          return compatibleList.some(c => c.toLowerCase() === enfLower);
        });
      });

      vaptLog.log(`Compatible enforcers for ${feature.key || feature.id}:`, {
        compatibleEnforcers,
        environmentCapabilities: capabilities,
        compatibilityMapKeys: Object.keys(compatibilityMap)
      });

      // 3. Auto-select optimal enforcer if none is currently selected
      const currentEnforcer = feature.active_enforcer;
      vaptLog.log(`Current enforcer for ${feature.key || feature.id}:`, currentEnforcer);

      if (!currentEnforcer && compatibleEnforcers.length > 0) {
        // Try to match optimal platform first
        const optimalEnforcer = findOptimalEnforcer(compatibleEnforcers, optimal, compatibilityMap);
        vaptLog.log(`Optimal enforcer for ${feature.key || feature.id}:`, optimalEnforcer);

        if (optimalEnforcer) {
          // Auto-select the optimal enforcer
          return [optimalEnforcer];
        }

        // If no optimal match, select highest priority compatible enforcer
        const highestPriorityEnforcer = getHighestPriorityEnforcer(compatibleEnforcers, compatibilityMap);
        vaptLog.log(`Highest priority enforcer for ${feature.key || feature.id}:`, highestPriorityEnforcer);

        if (highestPriorityEnforcer) {
          return [highestPriorityEnforcer];
        }
      }

      const result = compatibleEnforcers;
      if (result.length === 0) {
        vaptLog.warn(`No compatible enforcer found for ${feature.key || feature.id}`);
      }
      vaptLog.log(`Returning enforcers for ${feature.key || feature.id}:`, result);
      return result;
    };

    /**
     * Find the enforcer that matches the optimal platform
     */
    const findOptimalEnforcer = (compatibleEnforcers, optimalPlatform, compatibilityMap) => {
      // Map optimal platform to capability names
      const platformToCapability = {
        'cloudflare_edge': 'cloudflare_edge',
        'nginx_config': 'nginx_config',
        'apache_htaccess': 'apache_htaccess',
        'iis_config': 'iis_config',
        'caddy_native': 'caddy_native',
        'php_functions': 'php_functions',
        'server_cron': 'server_cron',
        'fail2ban': 'fail2ban'
      };

      const targetCapability = platformToCapability[optimalPlatform];
      if (!targetCapability) return null;

      const platformConfig = compatibilityMap[targetCapability];
      if (!platformConfig) return null;

      // Find enforcer that matches the optimal platform's enforcers
      return compatibleEnforcers.find(enf => {
        const enfLower = enf.toLowerCase();
        return platformConfig.enforcers.some(e => e.toLowerCase() === enfLower);
      });
    };

    /**
     * Get the highest priority enforcer from compatible list
     */
    const getHighestPriorityEnforcer = (compatibleEnforcers, compatibilityMap) => {
      let highestPriority = -1;
      let selectedEnforcer = null;

      compatibleEnforcers.forEach(enf => {
        // Find which capability this enforcer belongs to
        for (const [cap, config] of Object.entries(compatibilityMap)) {
          if (config.enforcers && config.enforcers.some(e => e.toLowerCase() === enf.toLowerCase())) {
            if (config.priority > highestPriority) {
              highestPriority = config.priority;
              selectedEnforcer = enf;
            }
            break;
          }
        }
      });

      return selectedEnforcer;
    };

    // Update columnOrder if new keys are found that aren't in there
    useEffect(() => {
      const missingKeys = allKeys.filter(k => !columnOrder.includes(k));
      if (missingKeys.length > 0) {
        setColumnOrder([...columnOrder, ...missingKeys]);
      }
    }, [allKeys, columnOrder]);

    // 3. Filter & Sort
    let processedFeatures = [...safeFeatures];

    // Category Filter First
    if (selectedCategories.length > 0) {
      processedFeatures = processedFeatures.filter(f => selectedCategories.includes(f.category));
    }

    // Severity Filter (Case-Insensitive)
    if (selectedSeverities.length > 0) {
      const lowSelected = selectedSeverities.map(s => s.toLowerCase());
      processedFeatures = processedFeatures.filter(f => f.severity && lowSelected.includes(f.severity.toLowerCase()));
    }

    const stats = {
      unfilteredTotal: safeFeatures.length,
      total: processedFeatures.length,
      draft: processedFeatures.filter(f => f.status === 'Draft').length,
      develop: processedFeatures.filter(f => f.status === 'Develop').length,
      test: processedFeatures.filter(f => f.status === 'Test').length,
      release: processedFeatures.filter(f => f.status === 'Release').length
    };

    const resetFilters = () => {
      setSelectedCategories([]);
      setSelectedSeverities([]);
      setFilterStatus('all');
      setSearchQuery('');
    };

    // Status Filter Second
    if (filterStatus !== 'all') {
      processedFeatures = processedFeatures.filter(f => {
        // Handle legacy lowercase filters from localStorage
        const s = filterStatus.toLowerCase();
        if (s === 'draft') return f.status === 'Draft';
        if (s === 'develop') return f.status === 'Develop';
        if (s === 'release') return f.status === 'Release';
        return f.status === filterStatus;
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      processedFeatures = processedFeatures.filter(f =>
        (f.name || f.label).toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q))
      );
    }

    processedFeatures.sort((a, b) => {
      // Primary Sort: Data Source
      if (sortBySource) {
        const getSourceWeight = (f) => {
          if (f.exists_in_multiple_files) return 3;
          if (f.is_from_active_file !== false) return 2;
          return 1;
        };
        const wA = getSourceWeight(a);
        const wB = getSourceWeight(b);
        if (wA !== wB) {
          return sortSourceDirection === 'asc' ? (wA - wB) : (wB - wA);
        }
      }

      // Secondary Sort: Column Headers (Existing Logic)
      const nameA = (a.name || a.label || '').toLowerCase();
      const nameB = (b.name || b.label || '').toLowerCase();
      const catA = (a.category || '').toLowerCase();
      const catB = (b.category || '').toLowerCase();

      const sevPriority = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1, 'informational': 0 };
      const sevA = sevPriority[(a.severity || '').toLowerCase()] || 0;
      const sevB = sevPriority[(b.severity || '').toLowerCase()] || 0;

      let comparison = 0;
      if (sortBy === 'name' || sortBy === 'title') comparison = nameA.localeCompare(nameB);
      else if (sortBy === 'category') comparison = catA.localeCompare(catB);
      else if (sortBy === 'severity') comparison = sevA - sevB;
      else if (sortBy === 'enforcer') {
        const enfA = (a.active_enforcer || (resolveEnforcer(a)[0] || '')).toLowerCase();
        const enfB = (b.active_enforcer || (resolveEnforcer(b)[0] || '')).toLowerCase();
        comparison = enfA.localeCompare(enfB);
      }

      else if (sortBy === 'status') {
        const priority = {
          'Release': 3,
          'Develop': 2,
          'Draft': 1
        };
        comparison = (priority[a.status] || 0) - (priority[b.status] || 0);
      } else {
        const valA = String(a[sortBy] !== undefined ? a[sortBy] : '').toLowerCase();
        const valB = String(b[sortBy] !== undefined ? b[sortBy] : '').toLowerCase();
        comparison = valA.localeCompare(valB, undefined, { numeric: true });
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });



    return el('div', { id: 'vapt-feature-list-tab', className: 'vapt-feature-list-tab-wrap' }, [
      el(PanelBody, { id: 'vapt-feature-list-panel', title: __('Exhaustive Feature List', 'vaptguard'), className: 'vapt-compact-panel', initialOpen: true }, [
        // Top Controls & Unified Header
        el('div', { id: 'vapt-feature-list-header-controls', key: 'controls', style: { marginBottom: '10px' } }, [
          // Unified Header Block (Source, Columns, Manage, Upload)
          el('div', {
            id: 'vapt-feature-list-toolbar',
            className: 'vapt-toolbar-block'
          }, [
            // Branded Icon with Configure Columns Dropdown
            el(Dropdown, {
              renderToggle: ({ isOpen, onToggle }) => el('div', {
                id: 'vapt-btn-configure-columns',
                onClick: onToggle,
                className: 'vapt-toolbar-btn-icon',
                'aria-expanded': isOpen,
                title: __('Configure Table Columns', 'vaptguard')
              }, el(Icon, { icon: 'layout', size: 18 })),
              renderContent: ({ onClose }) => {
                const activeFields = columnOrder.filter(c => visibleCols.includes(c) && allKeys.includes(c));
                const availableFields = allKeys.filter(c => !visibleCols.includes(c));
                const half = Math.ceil(availableFields.length / 2);
                const availableCol1 = availableFields.slice(0, half);
                const availableCol2 = availableFields.slice(half);

                return el('div', { style: { padding: '20px', width: '850px' } }, [
                  el('h4', { style: { marginTop: 0, marginBottom: '5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
                    sprintf(__('Configure Table Columns: %s', 'vaptguard'), selectedFile),
                    el('div', { style: { display: 'flex', alignItems: 'center', gap: '15px' } }, [
                      colSaveStatus && el('span', { style: { fontSize: '11px', color: '#00a32a', fontWeight: 'bold' } }, __('Saved to Browser', 'vaptguard')),
                      el(Button, {
                        isSecondary: true,
                        isSmall: true,
                        onClick: onClose,
                        style: { height: '24px', lineHeight: '1' }
                      }, __('Close', 'vaptguard'))
                    ])
                  ]),
                  el('p', { style: { fontSize: '12px', color: '#666', marginBottom: '20px' } }, __('Confirm the table sequence and add/remove fields.', 'vaptguard')),
                  el('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(280px, 1.2fr) 1fr 1fr', gap: '15px' } }, [
                    el('div', null, [
                      el('h5', { style: { margin: '0 0 8px 0', fontSize: '11px', textTransform: 'uppercase', color: '#2271b1', fontWeight: 'bold' } }, __('Active Table Sequence', 'vaptguard')),
                      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                        activeFields.map((field, activeIdx) => {
                          const masterIdx = columnOrder.indexOf(field);
                          return el('div', {
                            key: field,
                            draggable: true,
                            onDragStart: (e) => handleDragStart(e, field),
                            onDragOver: handleDragOver,
                            onDrop: (e) => handleDrop(e, field),
                            style: {
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '4px 8px',
                              background: draggedCol === field ? '#eef' : '#f0f6fb',
                              borderRadius: '4px',
                              border: '1px solid #c8d7e1',
                              cursor: 'grab',
                              opacity: draggedCol === field ? 0.5 : 1,
                              transition: 'all 0.2s'
                            }
                          }, [
                            el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                              el('span', { className: 'dashicons dashicons-menu', style: { color: '#aaa', cursor: 'grab', fontSize: '16px' } }),
                              el('span', { style: { fontSize: '10px', fontWeight: 'bold', color: '#72777c', minWidth: '20px' } }, `#${activeIdx + 1}`),
                              el(CheckboxControl, {
                                label: field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' '),
                                checked: true,
                                onChange: () => setVisibleCols(visibleCols.filter(c => c !== field)),
                                __nextHasNoMarginBottom: true,
                                __next40pxDefaultSize: true,
                                style: { margin: 0 }
                              })
                            ])
                          ]);
                        })
                      )]),
                    el('div', null, [
                      el('h5', { style: { margin: '0 0 8px 0', fontSize: '11px', textTransform: 'uppercase', color: '#666', fontWeight: 'bold' } }, __('Available Fields', 'vaptguard')),
                      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                        availableCol1.map((field) => (
                          el('div', { key: field, style: { display: 'flex', alignItems: 'center', padding: '4px 8px', background: '#fff', borderRadius: '4px', border: '1px solid #e1e1e1' } }, [
                            el(CheckboxControl, {
                              label: field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' '),
                              checked: false,
                              onChange: () => setVisibleCols([...visibleCols, field]),
                              style: { margin: 0 }
                            })
                          ])
                        ))
                      )
                    ]),
                    el('div', null, [
                      el('h5', { style: { margin: '0 0 8px 0', fontSize: '11px', textTransform: 'uppercase', color: 'transparent', userSelect: 'none' } }, __('Available Fields', 'vaptguard')),
                      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                        availableCol2.map((field) => (
                          el('div', { key: field, style: { display: 'flex', alignItems: 'center', padding: '4px 8px', background: '#fff', borderRadius: '4px', border: '1px solid #e1e1e1' } }, [
                            el(CheckboxControl, {
                              label: field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' '),
                              checked: false,
                              onChange: () => setVisibleCols([...visibleCols, field]),
                              style: { margin: 0 }
                            })
                          ])
                        ))
                      )
                    ])
                  ]),
                  el('div', { style: { marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                    el('span', { style: { fontSize: '11px', color: '#949494' } }, sprintf(__('%d Columns active, %d Available', 'vaptguard'), activeFields.length, availableFields.length)),
                    el(Button, {
                      isLink: true, isDestructive: true,
                      onClick: () => {
                        const defaultFields = ['title', 'category', 'severity', 'description'];
                        setColumnOrder(defaultFields);
                        setVisibleCols(defaultFields);
                      }
                    }, __('Reset to Default', 'vaptguard'))
                  ])
                ]);
              }
            }),

            // Map Include Fields Button
            el(Button, {
              isSecondary: true,
              isSmall: true,
              icon: 'networking', // Using networking to represent mapping
              onClick: () => setIsMappingModalOpen(true),
              style: { marginLeft: '5px', fontSize: '11px', height: '30px', minHeight: '30px', boxSizing: 'border-box', lineHeight: '1' }
            }, __('Map Include Fields', 'vaptguard')),

            // Feature Source Selection
            // Feature Source Selection (Checkbox Style)
            el('div', {
              style: {
                flexGrow: 1,
                paddingLeft: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }
            }, [
              // Data Sources Label
              // el('span', { style: { fontWeight: '700', textTransform: 'uppercase', fontSize: '9px', color: '#64748b' } }, __('Data Sources:', 'vaptguard')),

              // Checkbox Container
              el('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } }, [
                // "All Data Files" Option (Only show for 3+ files)
                dataFiles.length >= 3 && el('label', {
                  key: 'all-files',
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: (selectedFile || '').split(',').includes('__all__') ? '700' : '500',
                    color: (selectedFile || '').split(',').includes('__all__') ? '#1e3a8a' : '#64748b'
                  }
                }, [
                  el('input', {
                    type: 'checkbox',
                    checked: (selectedFile || '').split(',').includes('__all__'),
                    onChange: () => onSelectFile('__all__'),
                    style: { margin: 0, width: '13px', height: '13px' }
                  }),
                  __('All Data Files', 'vaptguard')
                ]),
                // Individual Files
                ...dataFiles.map(file => {
                  const isAllSelected = (selectedFile || '').split(',').includes('__all__');
                  const currentFiles = (selectedFile || '').split(',').filter(f => f && f !== '__all__');
                  const isChecked = isAllSelected || currentFiles.includes(file.value);
                  const isLastSelected = isChecked && currentFiles.length === 1 && currentFiles.includes(file.value);
                  const isDisabled = isAllSelected || isLastSelected;

                  return el('label', {
                    key: file.value,
                    title: isDisabled ? (isLastSelected ? __('At least one source must be selected.', 'vaptguard') : '') : '',
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: isDisabled ? 'default' : 'pointer',
                      fontSize: '11px',
                      fontWeight: isChecked ? '700' : '500',
                      color: isChecked ? '#1e3a8a' : '#64748b',
                      opacity: isDisabled ? 0.6 : 1
                    }
                  }, [
                    el('input', {
                      type: 'checkbox',
                      checked: isChecked,
                      disabled: isDisabled,
                      onChange: () => !isDisabled && onSelectFile(file.value),
                      style: {
                        margin: 0,
                        width: '13px',
                        height: '13px',
                        pointerEvents: isDisabled ? 'none' : 'auto',
                        cursor: isDisabled ? 'default' : 'pointer'
                      }
                    }),
                    file.label
                  ]);
                })
              ])
            ]),

            // Sort Control
            el('div', { style: { borderLeft: '1px solid #dcdcde', paddingLeft: '12px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' } }, [
              el(CheckboxControl, {
                label: __('Sort by Data Source', 'vaptguard'),
                checked: sortBySource,
                onChange: (val) => setSortBySource(val),
                className: 'vapt-sort-checkbox',
                __nextHasNoMarginBottom: true,
                style: { margin: 0, whiteSpace: 'nowrap' } // Explicitly prevent wrap
              }),
              sortBySource && el(Button, {
                icon: sortSourceDirection === 'asc' ? 'arrow-up' : 'arrow-down',
                label: sortSourceDirection === 'asc' ? __('Ascending', 'vaptguard') : __('Descending', 'vaptguard'),
                onClick: () => setSortSourceDirection(sortSourceDirection === 'asc' ? 'desc' : 'asc'),
                style: { minWidth: '24px', padding: 0, height: '24px', marginLeft: '-4px' }
              })
            ]),

            // Manage Sources Trigger
            el('div', { style: { borderLeft: '1px solid #dcdcde', paddingLeft: '12px', display: 'flex', alignItems: 'center' } }, [
              el(Button, {
                isSecondary: true,
                icon: 'admin-settings',
                onClick: () => setIsManageModalOpen(true),
                label: __('Manage Sources', 'vaptguard'),
                style: { height: '30px', minHeight: '30px', width: '30px', border: '1px solid #2271b1', color: '#2271b1', boxSizing: 'border-box', padding: 0 }
              })
            ]),

            // Upload Section
            el('div', { style: { borderLeft: '1px solid #dcdcde', paddingLeft: '12px', display: 'flex', flexDirection: 'column' } }, [
              // Label removed per user request
              el('input', {
                type: 'file',
                accept: '.json',
                onChange: (e) => e.target.files.length > 0 && onUpload(e.target.files[0]),
                style: { fontSize: '11px', color: '#555', height: '30px', padding: '4px 0', boxSizing: 'border-box' }
              })
            ])
          ]),

          // Manage Sources Modal
          isManageModalOpen && el(Modal, {
            title: __('Manage JSON Sources', 'vaptguard'),
            onRequestClose: () => setIsManageModalOpen(false)
          }, [
            el('p', null, __('Deselect files to hide them from the Feature Source dropdown. The active file cannot be hidden.', 'vaptguard')),
            el('div', { style: { maxHeight: '400px', overflowY: 'auto' } }, [
              allFiles.map(file => el('div', {
                key: file.filename,
                style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee' }
              }, [
                el(CheckboxControl, {
                  label: file.display_name || file.filename.replace(/_/g, ' '),
                  checked: !hiddenFiles.includes(file.filename),
                  disabled: file.filename === selectedFile,
                  onChange: (val) => {
                    const newHidden = val
                      ? hiddenFiles.filter(h => h !== file.filename)
                      : [...hiddenFiles, file.filename];
                    onUpdateHiddenFiles(newHidden);
                  }
                }),
                el(Button, {
                  icon: 'no',
                  isDestructive: true,
                  isSmall: true,
                  disabled: file.filename === selectedFile,
                  onClick: () => setConfirmingFile(file.filename),
                  label: __('Remove from list', 'vaptguard'),
                  style: { marginLeft: '10px' }
                })
              ]))
            ]),
            confirmingFile && el(Modal, {
              title: __('Confirm Removal', 'vaptguard'),
              onRequestClose: () => setConfirmingFile(null),
              className: 'vapt-confirm-modal',
              overlayClassName: 'vapt-confirm-modal-overlay'
            }, [
              el('p', null, __('Are you sure you want to remove this source from the list? The physical file will remains on the server as a backup and can be restored by re-uploading.', 'vaptguard')),
              el('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' } }, [
                el(Button, {
                  isSecondary: true,
                  onClick: () => setConfirmingFile(null)
                }, __('Cancel', 'vaptguard')),
                el(Button, {
                  isPrimary: true,
                  isDestructive: true,
                  onClick: () => {
                    onRemoveFile(confirmingFile);
                    setConfirmingFile(null);
                  }
                }, __('Confirm Removal', 'vaptguard'))
              ])
            ]),
            el('div', { style: { marginTop: '20px', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' } }, [
              manageSourcesStatus === 'saving' && el(Spinner),
              manageSourcesStatus === 'saved' && el('span', { style: { color: '#00a32a', fontWeight: 'bold' } }, __('Saved', 'vaptguard')),
              el(Button, { isPrimary: true, onClick: () => setIsManageModalOpen(false) }, __('Close', 'vaptguard'))
            ])
          ]),

          // Summary Pill Row
          el('div', {
            style: {
              display: 'flex',
              gap: '15px',
              padding: '6px 15px',
              background: '#fff',
              border: '1px solid #dcdcde',
              borderRadius: '4px',
              marginBottom: '10px',
              alignItems: 'center',
              fontSize: '11px',
              color: '#333'
            }
          }, [
            el('span', { style: { fontWeight: '700', textTransform: 'uppercase', fontSize: '10px', color: '#666' } }, __('Summary:', 'vaptguard')),
            el('span', { style: { fontWeight: '600', color: '#2271b1' } },
              stats.total === stats.unfilteredTotal
                ? sprintf(__('Total: %d', 'vaptguard'), stats.total)
                : sprintf(__('Filtered: %d of %d', 'vaptguard'), stats.total, stats.unfilteredTotal)
            ),
            el('span', { style: { opacity: 0.7 } }, sprintf(__('Draft: %d', 'vaptguard'), stats.draft)),
            el('span', { style: { color: '#d63638', fontWeight: '600' } }, sprintf(__('Develop: %d', 'vaptguard'), stats.develop)),
            el('span', { style: { color: '#ff9900', fontWeight: '600' } }, sprintf(__('Test: %d', 'vaptguard'), stats.test)),
            el('span', { style: { color: '#46b450', fontWeight: '700' } }, sprintf(__('Release: %d', 'vaptguard'), stats.release)),


            (stats.total < stats.unfilteredTotal || searchQuery || filterStatus !== 'all') && el(Button, {
              isLink: true,
              isSmall: true,
              onClick: resetFilters,
              style: { marginLeft: 'auto', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' }
            }, __('Reset All Filters', 'vaptguard'))
          ])
        ]),
        // Filters Row (Ultra-Slim)
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'nowrap', alignItems: 'stretch', marginBottom: '0' } }, [
          // Search Box
          el('div', { style: { flex: '1 1 180px', background: '#f6f7f7', padding: '4px 10px', borderRadius: '4px', border: '1px solid #dcdcde', display: 'flex', flexDirection: 'column', justifyContent: 'center' } }, [
            el('label', { className: 'components-base-control__label', style: { display: 'block', marginBottom: '2px', fontWeight: '600', textTransform: 'uppercase', fontSize: '9px', color: '#666', letterSpacing: '0.02em' } }, __('Search Features', 'vaptguard')),
            el('div', { style: { position: 'relative' } }, [
              el(TextControl, {
                value: searchQuery,
                onChange: setSearchQuery,
                placeholder: __('Search...', 'vaptguard'),
                hideLabelFromVision: true,
                style: { margin: 0, height: '28px', minHeight: '28px', fontSize: '12px', paddingRight: '24px' }
              }),
              searchQuery && el(Button, {
                icon: 'no-alt', // Unfilled circle-style 'X'
                label: __('Clear Search', 'vaptguard'),
                onClick: () => setSearchQuery(''),
                style: {
                  position: 'absolute',
                  right: '6px', // Slightly shifted for better balance
                  top: '50%',
                  transform: 'translateY(-50%)',
                  minWidth: '20px',
                  width: '20px',
                  height: '20px',
                  padding: 0,
                  color: '#717171', // Darker Grey
                  background: 'transparent',
                  boxShadow: 'none',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.8
                }
              })
            ])
          ]),

          // Category Unit
          el('div', { style: { flex: '0 0 auto', background: '#f6f7f7', padding: '4px 10px', borderRadius: '4px', border: '1px solid #dcdcde', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '150px' } }, [
            el('label', { className: 'components-base-control__label', style: { display: 'block', marginBottom: '2px', fontWeight: '600', textTransform: 'uppercase', fontSize: '9px', color: '#666', letterSpacing: '0.02em' } }, __('Filter by Category', 'vaptguard')),
            el(Dropdown, {
              renderToggle: ({ isOpen, onToggle }) => el(Button, {
                isSecondary: true,
                onClick: onToggle,
                'aria-expanded': isOpen,
                icon: 'filter',
                style: {
                  height: '28px',
                  minHeight: '28px',
                  width: '100%',
                  justifyContent: 'flex-start',
                  gap: '6px',
                  borderColor: '#2271b1',
                  color: '#2271b1',
                  background: '#fff',
                  fontSize: '11px',
                  padding: '0 8px'
                }
              }, selectedCategories.length === 0 ? __('All Categories', 'vaptguard') : sprintf(__('%d Selected', 'vaptguard'), selectedCategories.length)),
              renderContent: () => el('div', { style: { padding: '15px', minWidth: '250px', maxHeight: '300px', overflowY: 'auto' } }, [
                el(CheckboxControl, {
                  label: __('All Categories', 'vaptguard'),
                  checked: selectedCategories.length === 0,
                  onChange: () => setSelectedCategories([])
                }),
                el('hr', { style: { margin: '10px 0' } }),
                ...categories.map(cat => el(CheckboxControl, {
                  key: cat,
                  label: cat,
                  checked: selectedCategories.includes(cat),
                  onChange: (isChecked) => {
                    if (isChecked) setSelectedCategories([...selectedCategories, cat]);
                    else setSelectedCategories(selectedCategories.filter(c => c !== cat));
                  }
                }))
              ])
            })
          ]),

          // Severity Unit
          el('div', { style: { flex: '1 1 auto', background: '#f6f7f7', padding: '4px 10px', borderRadius: '4px', border: '1px solid #dcdcde', display: 'flex', flexDirection: 'column', justifyContent: 'center' } }, [
            el('label', { className: 'components-base-control__label', style: { display: 'block', marginBottom: '2px', fontWeight: '600', textTransform: 'uppercase', fontSize: '9px', color: '#666', letterSpacing: '0.02em' } }, __('Filter by Severity', 'vaptguard')),
            el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
              uniqueSeverities.map(sev => el(CheckboxControl, {
                key: sev,
                label: sev,
                checked: selectedSeverities.some(s => s.toLowerCase() === sev.toLowerCase()),
                onChange: (val) => {
                  const lowSev = sev.toLowerCase();
                  if (val) setSelectedSeverities([...selectedSeverities, sev]);
                  else setSelectedSeverities(selectedSeverities.filter(s => s.toLowerCase() !== lowSev));
                },
                style: { margin: 0, fontSize: '11px' }
              }))
            )
          ]),

          // Lifecycle Unit
          el('div', { style: { flex: '1 1 auto', background: '#f6f7f7', padding: '4px 10px', borderRadius: '4px', border: '1px solid #dcdcde', display: 'flex', flexDirection: 'column', justifyContent: 'center' } }, [
            el('label', { className: 'components-base-control__label', style: { display: 'block', marginBottom: '2px', fontWeight: '600', textTransform: 'uppercase', fontSize: '9px', color: '#666', letterSpacing: '0.02em' } }, __('Filter by Lifecycle Status', 'vaptguard')),
            el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
              [
                { label: __('All', 'vaptguard'), value: 'all' },
                { label: __('Draft', 'vaptguard'), value: 'draft' },
                { label: __('Develop', 'vaptguard'), value: 'develop' },
                { label: __('Test', 'vaptguard'), value: 'test' },
                { label: __('Release', 'vaptguard'), value: 'release' },
              ].map(opt => el('label', { key: opt.value, style: { display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px' } }, [
                el('input', {
                  type: 'radio',
                  name: 'vaptguard_filter_status',
                  value: opt.value,
                  checked: filterStatus === opt.value,
                  onChange: (e) => setFilterStatus(e.target.value),
                  style: { margin: 0, width: '14px', height: '14px' }
                }),
                opt.label
              ])))
          ])
        ]),
      ]), // End Header PanelBody

      // 🛡️ SUPERADMIN: Visual Legend (v3.6.30)

      loading ? el(Spinner, { key: 'loader' }) : el('table', { id: 'vapt-main-feature-table', key: 'table', className: 'wp-list-table widefat striped vapt-feature-table' }, [
        el('thead', null, el('tr', null, [
          ...activeCols.map(col => {
            const label = col.charAt(0).toUpperCase() + col.slice(1).replace(/_/g, ' ');
            const isDescription = col === 'description';
            const isName = col === 'name';
            const isCategory = col === 'category';
            // Description gets auto, name and category get auto (no fixed width), others get 1%
            const width = isDescription || isName || isCategory ? 'auto' : '1%';
            // All columns except description should not wrap
            const whiteSpace = isDescription ? 'normal' : 'nowrap';

            const isSortable = ['RiskID', 'id', 'name', 'category', 'severity', 'owasp', 'test_method', 'verification_steps'].includes(col);
            const isActive = sortBy === col;

            return el('th', {
              id: `vapt-th-${col}`,
              key: col,
              onClick: isSortable ? () => toggleSort(col) : null,
              className: `vapt-th-sortable ${isActive ? 'is-active' : ''} ${isSortable ? 'sortable' : ''}`,
              style: { width, whiteSpace }
            }, el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
              label,
              isSortable && el('span', {
                id: `vapt-sort-indicator-${col}`,
                className: 'vapt-sort-indicator',
                style: {
                  opacity: isActive ? 1 : 0.3,
                  color: isActive ? '#2271b1' : '#72777c',
                  display: 'flex',
                  alignItems: 'center'
                }
              }, el(Icon, {
                icon: isActive
                  ? (sortOrder === 'asc' ? 'arrow-up' : 'arrow-down')
                  : 'sort'
              }))
            ]));
          }),
          el('th', { style: { width: '1%', whiteSpace: 'nowrap' } }, __('Lifecycle Status', 'vaptguard')),
          el('th', { style: { width: '1%', whiteSpace: 'nowrap' } }, __('Include', 'vaptguard')),
        ])),
        el('tbody', null, processedFeatures.map((f) => el(Fragment, { key: f.key }, [
          el('tr', {
            className: f.exists_in_multiple_files ? 'vapt-feature-multi-file' : (f.is_from_active_file === false ? 'vapt-feature-inactive-only' : '')
          }, [
            ...activeCols.map(col => {
              let content = f[col] || '-';
              if (col === 'name') {
                content = el('strong', null, f.name);
              } else if (col === 'severity') {
                const s = (f[col] || '').toLowerCase();
                const map = { 'critical': 'Critical', 'high': 'High', 'medium': 'Medium', 'low': 'Low', 'informational': 'Informational' };
                const label = map[s] || (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
                content = el('span', { className: `vapt-severity-text severity-${s}` }, label);
              } else if (col === 'owasp') {
                content = el('span', { className: 'vapt-pill-compact', style: { background: '#f0f6fb', color: '#2271b1' } }, f[col]);
              } else if (col === 'verification_steps' && Array.isArray(f[col])) {
                content = el('ul', { style: { margin: 0, padding: 0, listStyle: 'decimal inside', fontSize: '11px' } },
                  f[col].map((step, idx) => el('li', { key: idx, style: { marginBottom: '2px' } }, step))
                );
              } else if (col === 'remediation') {
                content = el('div', { style: { fontSize: '11px', maxWidth: '300px', wordWrap: 'break-word' } }, f[col]);
              } else if (Array.isArray(f[col])) {
                content = el('div', { style: { fontSize: '11px', display: 'flex', flexWrap: 'wrap', gap: '4px' } }, f[col].map((item, idx) => el('span', { key: idx, className: 'vapt-pill-compact' },
                  typeof item === 'object' ? JSON.stringify(item) : String(item)
                )));
              }

              return el('td', {
                key: col,
                style: {
                  padding: '8px 12px',
                  verticalAlign: 'top',
                  fontSize: '12px'
                }
              }, content);
            }),
            el('td', { style: { verticalAlign: 'middle' } }, [
              el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, [
                el(LifecycleIndicator, {
                  feature: f,
                  onDirectUpdate: (key, updates) => updateFeature(key, updates),
                  onChange: (newStatus) => {
                    // Validation: Prevent Draft -> Release
                    const currentStatus = f.status;
                    if (currentStatus === 'Draft' && newStatus === 'Release') {
                      setAlertState({
                        message: sprintf(__('Cannot transition directly from "Draft" to "%s". Please move to "Develop" first.', 'vaptguard'), newStatus),
                        type: 'error'
                      });
                      return;
                    }

                    let defaultNote = '';
                    const title = f.label || f.title;
                    if (newStatus === 'Develop') {
                      defaultNote = `Initiating implementation for ${title}. Configuring workbench and internal security drivers.`;
                    } else if (newStatus === 'Release') {
                      defaultNote = `Verification protocol passed for ${title}. Ready for baseline deployment.`;
                    } else {
                      defaultNote = `Reverting ${title} to Draft for further planning.`;
                    }

                    setTransitioning({
                      ...f,
                      nextStatus: newStatus,
                      note: defaultNote,
                      remediation: f.remediation || '',
                      assurance: f.assurance || [],
                      assurance_against: f.assurance_against || [],
                      owasp: f.owasp || '',
                      test_method: f.test_method || '',
                      verification_steps: f.verification_steps || [],
                      tests: f.tests || [],
                      evidence: f.evidence || [],
                      schema_hints: f.schema_hints || {},
                      dev_instruct: newStatus === 'Develop' ? generateDevInstructions(f, fieldMapping) : ''
                    });
                  }
                }),
                el(Button, {
                  icon: 'backup',
                  isSmall: true,
                  isTertiary: true,
                  disabled: !f.has_history,
                  onClick: () => f.has_history && setHistoryFeature(f),
                  label: f.has_history ? __('View History', 'vaptguard') : __('No History', 'vaptguard'),
                  style: { marginLeft: '10px', opacity: f.has_history ? 1 : 0.4 }
                })
              ])
            ]),
            el('td', { className: 'vapt-support-cell', style: { verticalAlign: 'middle' } }, [
              el('div', { style: { display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' } }, [
                // Premium Button for Workbench Design Hub
                !['Draft', 'draft', 'available'].includes(f.status) && (() => {
                  const schema = typeof f.generated_schema === 'string' ? JSON.parse(f.generated_schema || '{}') : (f.generated_schema || {});
                  const isCustom = schema.controls && schema.controls.length > 0 && !schema._instructions;

                  // Determine status class
                  let stageClass = '';
                  if (f.status === 'Test' || f.status === 'test') {
                    stageClass = 'stage-test';
                  } else if (f.status === 'Release' || f.status === 'release') {
                    stageClass = 'stage-release';
                  }

                  return el('div', { className: 'vapt-flex-row', style: { gap: '8px' } }, [
                    el(Button, {
                      className: `vapt-premium-btn ${isCustom ? 'is-custom' : ''} ${stageClass}`,
                      onClick: (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDesignFeature(f);
                      },
                      title: isCustom ? __('Open Workbench Design Bench (Custom)', 'vaptguard') : __('Open Workbench Design Bench (Default)', 'vaptguard')
                    }, __('Workbench Design', 'vaptguard')),
                    // A+ Adaptive Workbench Primary Action
                    el(Button, {
                      className: 'vapt-aplus-workbench-btn',
                      style: {
                        background: (() => {
                          // v1.9.5: 3-tier color matrix
                          // Orange → Release/implemented (approved for client)
                          // Green  → schema present AND enforced (actively deployed)
                          // Blue   → no schema or not enforced (pending implementation)
                          const isRelease = ['release', 'Release', 'implemented'].includes(f.status);
                          const hasSchema = f.generated_schema &&
                            f.generated_schema !== 'null' &&
                            f.generated_schema !== '{}' &&
                            f.generated_schema !== '[]' &&
                            (Array.isArray(f.generated_schema) ? f.generated_schema.length > 0 : Object.keys(f.generated_schema).length > 0);
                          const isEnforced = (f.is_enforced == 1) && hasSchema;
                          if (isRelease) return 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'; // Orange
                          if (isEnforced) return 'linear-gradient(135deg, #10b981 0%, #059669 100%)'; // Green
                          return 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)';                 // Blue
                        })(),
                        color: '#fff',
                        border: 'none',
                        fontWeight: '600',
                        fontSize: '11px',
                        padding: '0px 10px',
                        borderRadius: '4px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      },
                      onClick: (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (window.vaptguard_APlusGenerator) {
                          const aplusSchema = window.vaptguard_APlusGenerator.generate(f);
                          setDesignFeature({ ...f, generated_schema: aplusSchema, is_adaptive_deployment: 1 });
                        }
                      },
                      title: __('Initiate A+ Adaptive Schema Workflow (v3.2)', 'vaptguard')
                    }, __('A+ Workbench', 'vaptguard'))
                  ]);
                })()
              ])
            ])
          ])
        ])))
      ])
    ]);
  };

  const VAPTAdmin = () => {
    const [features, setFeatures] = useState([]);
    const [schema, setSchema] = useState({ item_fields: [] });
    const [domains, setDomains] = useState([]);
    const [dataFiles, setDataFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState('interface_schema_v2.0.json');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isDomainModalOpen, setDomainModalOpen] = useState(false);
    const [selectedDomain, setSelectedDomain] = useState(null);
    const [saveStatus, setSaveStatus] = useState(null); // { message: '', type: 'info'|'success'|'error' }
    const [designPromptConfig, setDesignPromptConfig] = useState(null);
    const [isPromptConfigModalOpen, setIsPromptConfigModalOpen] = useState(false);
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [transitioning, setTransitioning] = useState(null);
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('vaptguard_admin_active_tab') || 'features');
    const [historyFeature, setHistoryFeature] = useState(null);
    const [designFeature, setDesignFeature] = useState(null);
    const [confirmState, setConfirmState] = useState(null);
    const [selectedDomains, setSelectedDomains] = useState([]);
    const [alertState, setAlertState] = useState(null);
    const [rootAiInstructions, setRootAiInstructions] = useState({});
    const [rootGlobalSettings, setRootGlobalSettings] = useState({});
    // v1.9.2 – Batch Revert state
    const [batchRevertModal, setBatchRevertModal] = useState(null); // null | { previewData, isLoading, isExecuting }
    const [includeBroken, setIncludeBroken] = useState(true); // Toggle for including broken features (default: true)
    const [includeRelease, setIncludeRelease] = useState(false); // Toggle for including Release features

    const [catalogInfo, setCatalogInfo] = useState({ file: '', count: 0 }); // v3.6.29
    const [sortBySource, setSortBySource] = useState(false); // Primary Sort
    const [sortSourceDirection, setSortSourceDirection] = useState('desc'); // Primary Sort Direction
    const [environmentProfile, setEnvironmentProfile] = useState(null); // v2.4.14 - For dynamic enforcer mapping

    // Field Mapping State
    const [fieldMapping, setFieldMapping] = useState(() => {
      const saved = localStorage.getItem('vaptguard_field_mapping');
      return saved ? JSON.parse(saved) : {};
    });

    useEffect(() => {
      localStorage.setItem('vaptguard_field_mapping', JSON.stringify(fieldMapping));
    }, [fieldMapping]);

    const allKeys = useMemo(() => {
      // Collect keys from multiple data sources
      const sources = [];

      // 1. Features data (existing source)
      if (features && features.length > 0) {
        sources.push(...features);
      }

      // 2. AI Agent Instructions (contains patterns, verification steps, etc.)
      if (rootAiInstructions && Object.keys(rootAiInstructions).length > 0) {
        sources.push(rootAiInstructions);
      }

      // 3. Global Settings (may contain operational context, verification steps)
      if (rootGlobalSettings && Object.keys(rootGlobalSettings).length > 0) {
        sources.push(rootGlobalSettings);
      }

      if (sources.length === 0) return [];

      const flattenKeys = (obj, prefix = '', depth = 0) => {
        let keys = [];
        // Increase depth limit to 3 to capture deeper nested keys
        // This allows us to get keys like patterns.RISK-001.wp_config.verification
        if (depth > 3) return keys;
        for (const key in obj) {
          if (!obj.hasOwnProperty(key)) continue;
          const newKey = prefix ? `${prefix}.${key}` : key;

          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            const childKeys = flattenKeys(obj[key], newKey, depth + 1);
            // Include child keys
            if (childKeys.length > 0) keys = keys.concat(childKeys);
            // Also include the object key itself if it might be used directly
            // But skip very generic keys like 'patterns' unless they have specific value
            if (depth < 2 || !['patterns', 'enforcer_key_map', 'bundle_files'].includes(key)) {
              keys.push(newKey);
            }
          } else {
            // For leaf values, include the key
            keys.push(newKey);
          }
        }
        return keys;
      };

      const keys = new Set();
      sources.forEach(source => {
        const flat = flattenKeys(source);
        flat.forEach(k => keys.add(k));
      });

      // Add some common variations that might not be in the data
      const additionalKeys = [
        'operational_notes.context',
        'testing.verification_steps',
        'verification_steps',
        'context',
        'steps',
        'verification',
        'operational_context',
        'implementation_context'
      ];
      additionalKeys.forEach(k => keys.add(k));

      return Array.from(keys).sort();
    }, [features, rootAiInstructions, rootGlobalSettings]);

    // Status Auto-clear helper
    useEffect(() => {
      if (saveStatus && saveStatus.type === 'success') {
        const timer = setTimeout(() => setSaveStatus(null), 2000);
        return () => clearTimeout(timer);
      }
    }, [saveStatus]);

    const fetchData = (file = selectedFile, silent = false) => {
      vaptLog.log('Fetching data for file:', file);
      if (!silent) setLoading(true);
      setSchema({ item_fields: [] }); // Clear previous schema while loading

      // Use individual catches to prevent one failure from blocking all
      const fetchFeatures = apiFetch({ path: `vaptguard/v1/features?file=${file}` })
        .then(res => {
          if (res.error) throw new Error(res.error);
          setFeatures(res.features || []);
          setSchema(res.schema || { item_fields: [] });
          setDesignPromptConfig(res.design_prompt || null); // Load prompt config
          setRootAiInstructions(res.ai_agent_instructions || {});
          setRootGlobalSettings(res.global_settings || {});
          setEnvironmentProfile(res.environment_profile || null);
          if (res.active_catalog) {
            setCatalogInfo({ file: res.active_catalog, count: res.total_features || 0 });
          }
          return res;
        })
        .catch(err => { vaptLog.error('Features fetch error:', err); return []; });
      const fetchDomains = apiFetch({ path: 'vaptguard/v1/domains' })
        .catch(err => { vaptLog.error('Domains fetch error:', err); return []; });
      const fetchDataFiles = apiFetch({ path: 'vaptguard/v1/data-files' })
        .catch(err => { vaptLog.error('Data files fetch error:', err); return []; });

      return Promise.all([fetchFeatures, fetchDomains, fetchDataFiles])
        .then(([res, domainData, files]) => {
          const cleanedFiles = (files || []).map(f => ({ ...f, label: (f.label || f.filename).replace(/_/g, ' ') }));
          setFeatures(res.features || []);
          setSchema(res.schema || { item_fields: [] });
          setDesignPromptConfig(res.design_prompt || null);
          setRootAiInstructions(res.ai_agent_instructions || {});
          setRootGlobalSettings(res.global_settings || {});
          setEnvironmentProfile(res.environment_profile || null);
          setDomains(domainData || []);
          setDataFiles(cleanedFiles);
          setLoading(false);
        })
        .catch((err) => {
          vaptLog.error('Dashboard data fetch error:', err);
          setError(sprintf(__('Critical error loading dashboard data: %s', 'vaptguard'), err.message || 'Unknown error'));
          setLoading(false);
        });
    };

    useEffect(() => {
      // First fetch the active file from backend setup
      apiFetch({ path: 'vaptguard/v1/active-file' }).then(res => {
        if (res.active_file) {
          setSelectedFile(res.active_file);
          fetchData(res.active_file);
        } else {
          fetchData();
        }
      }).catch(() => fetchData());
    }, []);

    const onSelectFile = (file) => {
      const BASELINE_FILE = 'interface_schema_v2.0.json';
      let nextFiles = [];
      const currentFiles = (selectedFile || '').split(',').filter(Boolean);

      if (file === '__all__') {
        nextFiles = ['__all__'];
      } else {
        const realFiles = currentFiles.filter(f => f !== '__all__');

        if (currentFiles.includes(file)) {
          // Deselect this file
          // Prevent deselecting if it is the last remaining file
          if (realFiles.length <= 1) return;

          nextFiles = currentFiles.filter(f => f !== file && f !== '__all__');
        } else {
          // Add this file to selection
          nextFiles = [...realFiles, file];
        }
      }

      const nextFileStr = nextFiles.join(',') || 'interface_schema_v2.0.json'; // Fallback to default if empty
      setSelectedFile(nextFileStr);
      fetchData(nextFileStr);
      // Persist to backend
      apiFetch({
        path: 'vaptguard/v1/active-file',
        method: 'POST',
        data: { file: nextFileStr }
      }).catch(err => vaptLog.error('Failed to sync active file:', err));
    };

    const updateFeature = (key, data) => {
      // Optimistic Update
      setFeatures(prev => prev.map(f => f.key === key ? { ...f, ...data } : f));
      setSaveStatus({ message: __('Saving...', 'vaptguard'), type: 'info' });

      return apiFetch({
        path: 'vaptguard/v1/features/update',
        method: 'POST',
        data: { key, ...data }
      }).then(() => {
        setSaveStatus({ message: __('Saved', 'vaptguard'), type: 'success' });
      }).catch(err => {
        vaptLog.error('Update failed:', err);
        const errMsg = err.message || (err.data && err.data.message) || err.error || __('Error saving!', 'vaptguard');
        setSaveStatus({ message: errMsg, type: 'error' });
      });
    };

    const confirmTransition = (formValues) => {
      if (!transitioning) return;
      const { key, nextStatus } = transitioning;
      const { note, dev_instruct, wireframeUrl } = formValues;

      const safeFeatures = Array.isArray(features) ? features : [];
      const feature = safeFeatures.find(f => f.key === key);
      let updates = { status: nextStatus, history_note: note, dev_instruct: dev_instruct };

      // Save Wireframe if provided
      if (wireframeUrl) {
        updates.wireframe_url = wireframeUrl;
      }

      // Special Case: Reset if moving back to Draft
      if (nextStatus === 'Draft' || nextStatus === 'draft') {
        updates.generated_schema = null;
        updates.implementation_data = null;
        updates.has_history = false;
        updates.wireframe_url = ''; // Clear wireframe too
        updates.dev_instruct = '';
        updates.include_verification_engine = 0;
        updates.include_verification_guidance = 0;
        // No need to set reset_history flag here because the backend handles the actual deletion based on status=Draft
        // But we update optimistic state above (has_history=false)
      }

      // Auto-Generate Interface when moving to 'Develop' (Phase 6 transition)
      if (nextStatus === 'Develop' && typeof Generator !== 'undefined' && Generator && feature && feature.remediation) {
        try {
          const schema = Generator.generate(feature.remediation, dev_instruct);
          if (schema) {
            updates.generated_schema = schema;
            vaptLog.log('Auto-generated schema for ' + key, schema);
          }
        } catch (e) {
          vaptLog.error('Generation error', e);
        }
      }

      updateFeature(key, updates);
      setTransitioning(null);
    };

    const addDomain = (domain, isWildcard = false, isEnabled = true, id = null) => {
      // Optimistic Update for better UX
      if (id) {
        setDomains(prev => prev.map(d => d.id === id ? { ...d, domain, is_wildcard: isWildcard, is_enabled: isEnabled } : d));
      }

      // Explicitly pass values as booleans to avoid truthiness confusion on backend
      return apiFetch({
        path: 'vaptguard/v1/domains/update',
        method: 'POST',
        data: {
          id: id,
          domain,
          is_wildcard: Boolean(isWildcard),
          is_enabled: Boolean(isEnabled)
        }
      }).then((res) => {
        if (res.domain) {
          setDomains(prev => {
            const exists = prev.find(d => d.id === res.domain.id);
            if (exists) {
              return prev.map(d => d.id === res.domain.id ? res.domain : d);
            } else {
              return [...prev, res.domain];
            }
          });
        }
        setSaveStatus({ message: __('Domain updated successfully', 'vaptguard'), type: 'success' });
        fetchData();
        return res;
      }).catch(err => {
        setSaveStatus({ message: __('Failed to update domain', 'vaptguard'), type: 'error' });
        fetchData(); // Rollback to server state
        throw err;
      });
    };

    const [deletingId, setDeletingId] = useState(null);

    const deleteDomain = (id) => {
      setDeletingId(id);
      apiFetch({
        path: `vaptguard/v1/domains/delete/${id}`,
        method: 'DELETE'
      }).then(() => {
        fetchData();
        setDeletingId(null);
      }).catch(() => {
        setDeletingId(null);
      });
    };

    const batchDeleteDomains = (ids) => {
      // Optimistic Delete
      setDomains(prev => prev.filter(d => !ids.includes(d.id)));

      return apiFetch({
        path: 'vaptguard/v1/domains/batch-delete',
        method: 'POST',
        data: { ids }
      }).then(() => {
        setSaveStatus({ message: sprintf(__('%d domains deleted', 'vaptguard'), ids.length), type: 'success' });
        setSelectedDomains([]);
        fetchData();
      }).catch(err => {
        setSaveStatus({ message: __('Batch delete failed', 'vaptguard'), type: 'error' });
        fetchData(); // Rollback
      });
    };

    const updateDomainFeatures = (domainId, updatedFeatures) => {
      // Optimistic Update
      setDomains(prev => prev.map(d => d.id === domainId ? { ...d, features: updatedFeatures } : d));
      setSaveStatus({ message: __('Saving...', 'vaptguard'), type: 'info' });

      apiFetch({
        path: 'vaptguard/v1/domains/features',
        method: 'POST',
        data: { domain_id: domainId, features: updatedFeatures }
      }).then(() => {
        setSaveStatus({ message: __('Saved', 'vaptguard'), type: 'success' });
      }).catch(err => {
        vaptLog.error('Domain features update failed:', err);
        setSaveStatus({ message: __('Error saving!', 'vaptguard'), type: 'error' });
      });
    };

    const uploadJSON = (file) => {
      const formData = new FormData();
      formData.append('file', file);

      setLoading(true);
      apiFetch({
        path: 'vaptguard/v1/upload-json',
        method: 'POST',
        body: formData,
      }).then((res) => {
        vaptLog.log('JSON uploaded', res);
        // Fetch fresh data (including file list) THEN update selection
        fetchData().then(() => { // Call fetchData without arguments to refresh all data, including dataFiles
          setSelectedFile(res.filename);
        });
      }).catch(err => {
        vaptLog.error('Upload error full object:', JSON.stringify(err));
        vaptLog.error('Upload error raw:', err);
        vaptLog.error('Upload error keys:', Object.keys(err));
        const errMsg = err.message || (err.data && err.data.message) || err.error || __('Error uploading JSON', 'vaptguard');
        setAlertState({ message: errMsg });
        setLoading(false);
      });
    };

    const [allFiles, setAllFiles] = useState([]);
    const [hiddenFiles, setHiddenFiles] = useState([]);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);

    const fetchAllFiles = () => {
      apiFetch({ path: 'vaptguard/v1/data-files/all' }).then(res => {
        // Clean display filenames (underscores to spaces)
        const cleaned = res.map(f => ({ ...f, display_name: f.filename.replace(/_/g, ' ') }));
        setAllFiles(cleaned);
        setHiddenFiles(res.filter(f => f.isHidden).map(f => f.filename));
      });
    };

    useEffect(() => {
      if (isManageModalOpen) {
        fetchAllFiles();
      }
    }, [isManageModalOpen]);

    const [manageSourcesStatus, setManageSourcesStatus] = useState(null);

    const updateHiddenFiles = (newHidden) => {
      setHiddenFiles(newHidden);
      setManageSourcesStatus('saving');
      apiFetch({
        path: 'vaptguard/v1/update-hidden-files',
        method: 'POST',
        data: { hidden_files: newHidden }
      }).then(() => {
        // v3.12.1: Refresh both dropdown AND active selection
        Promise.all([
          apiFetch({ path: 'vaptguard/v1/data-files' }),
          apiFetch({ path: 'vaptguard/v1/active-file' })
        ]).then(([files, activeRes]) => {
          setDataFiles(files);
          if (activeRes.active_file) {
            setSelectedFile(activeRes.active_file);
            fetchData(activeRes.active_file);
          }
        });
        setManageSourcesStatus('saved');
        setTimeout(() => setManageSourcesStatus(null), 2000);
      }).catch(() => setManageSourcesStatus('error'));
    };

    const removeJSONFile = (filename) => {
      setManageSourcesStatus('saving');
      apiFetch({
        path: 'vaptguard/v1/data-files/remove',
        method: 'POST',
        data: { filename }
      }).then(() => {
        fetchAllFiles(); // Refresh management list
        // v3.12.1: Refresh both dropdown AND active selection
        Promise.all([
          apiFetch({ path: 'vaptguard/v1/data-files' }),
          apiFetch({ path: 'vaptguard/v1/active-file' })
        ]).then(([files, activeRes]) => {
          setDataFiles(files);
          if (activeRes.active_file) {
            setSelectedFile(activeRes.active_file);
            fetchData(activeRes.active_file);
          }
        });
        setManageSourcesStatus('saved');
        setTimeout(() => setManageSourcesStatus(null), 2000);
      }).catch(() => {
        setManageSourcesStatus('error');
        setAlertState({ message: __('Failed to remove file from list', 'vaptguard') });
      });
    };

    // v1.9.2 – Batch Revert: Preview affected features
    const previewBatchRevert = (overrides = {}) => {
      const incBroken = overrides.includeBroken !== undefined ? overrides.includeBroken : includeBroken;
      const incRelease = overrides.includeRelease !== undefined ? overrides.includeRelease : includeRelease;

      setBatchRevertModal(prev => ({ ...(prev || {}), previewData: (prev ? prev.previewData : null), isLoading: true, isExecuting: false }));

      apiFetch({
        path: 'vaptguard/v1/features/preview-revert?include_broken=' + (incBroken ? '1' : '0') + '&include_release=' + (incRelease ? '1' : '0'),
        method: 'GET',
      }).then(res => {
        setBatchRevertModal({ previewData: res, isLoading: false, isExecuting: false });
      }).catch(err => {
        setSaveStatus({ message: err.message || __('Failed to preview revert', 'vaptguard'), type: 'error' });
        setBatchRevertModal(null);
      });
    };

    // v1.9.2 – Batch Revert: Execute the revert
    const executeBatchRevert = () => {
      if (!batchRevertModal?.previewData) return;
      setBatchRevertModal(prev => ({ ...prev, isExecuting: true }));

      apiFetch({
        path: 'vaptguard/v1/features/batch-revert',
        method: 'POST',
        data: { note: 'Batch revert to Draft via Workbench', include_broken: includeBroken, include_release: includeRelease }
      }).then(res => {
        setBatchRevertModal(null);
        setSaveStatus({
          message: sprintf(__('Successfully reverted %d features to Draft', 'vaptguard'), res.reverted_count),
          type: 'success'
        });
        // Refresh data to show updated statuses
        fetchData(selectedFile);
        setTimeout(() => setSaveStatus(null), 5000);
      }).catch(err => {
        setSaveStatus({ message: err.message || __('Batch revert failed', 'vaptguard'), type: 'error' });
        setBatchRevertModal(prev => ({ ...prev, isExecuting: false }));
      });
    };

    // v1.9.2 – Clear Enforcement Cache
    const clearEnforcementCache = () => {
      apiFetch({
        path: 'vaptguard/v1/clear-cache',
        method: 'POST',
      }).then(res => {
        setSaveStatus({
          message: __('Enforcement cache cleared. Refresh the page to see updated features.', 'vaptguard'),
          type: 'success'
        });
        setTimeout(() => setSaveStatus(null), 4000);
      }).catch(err => {
        setSaveStatus({ message: err.message || __('Failed to clear cache', 'vaptguard'), type: 'error' });
      });
    };

    const tabs = [
      {
        name: 'features',
        title: __('Feature List', 'vaptguard'),
        className: 'vapt-tab-features',
      },
      {
        name: 'license',
        title: __('License Management', 'vaptguard'),
        className: 'vapt-tab-license',
      },
      {
        name: 'domains',
        title: __('Domain Features', 'vaptguard'),
        className: 'vapt-tab-domains',
      },
      {
        name: 'build',
        title: __('Build Generator', 'vaptguard'),
        className: 'vapt-tab-build',
      },
    ];

    if (error) {
      return el('div', { id: 'vapt-admin-dashboard--error', className: 'vapt-admin-wrap' }, [
        el('h1', null, __('VAPT Secure Dashboard', 'vaptguard')),
        el(Notice, { status: 'error', isDismissible: false }, error),
        el(Button, { isSecondary: true, onClick: () => fetchData() }, __('Retry', 'vaptguard'))
      ]);
    }

    return el('div', { id: 'vapt-admin-dashboard--main', className: 'vapt-admin-wrap' }, [
      el('div', {
        className: 'vapt-dashboard-header-row',
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fff',
          padding: '0 20px',
          borderBottom: '1px solid #ccd0d4',
          marginBottom: '5px', // Reduced margin from 20px per request
          boxShadow: '0 1px 1px rgba(0,0,0,0.04)'
        }
      }, [
        // Left Column: Title
        el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } }, [
          el('h1', { style: { margin: 0, fontSize: '20px', fontWeight: '600', color: '#1d2327', lineHeight: '1.2', padding: '15px 0' } }, __('VAPT Secure Dashboard', 'vaptguard')),
          el('span', { style: { fontSize: '11px', color: '#646970' } }, `v${settings.pluginVersion}`)
        ]),

        // Center Column: Custom Tabs
        el('div', { style: { display: 'flex', gap: '0' } }, tabs.map(tab =>
          el('button', {
            key: tab.name,
            className: `vapt-custom-tab ${activeTab === tab.name ? 'is-active' : ''}`,
            onClick: () => {
              setActiveTab(tab.name);
              localStorage.setItem('vaptguard_admin_active_tab', tab.name);
            },
            style: {
              background: 'none',
              border: 'none',
              padding: '16px 15px',
              fontSize: '13px',
              fontWeight: activeTab === tab.name ? '600' : '400',
              color: activeTab === tab.name ? '#2271b1' : '#646970',
              borderBottom: activeTab === tab.name ? '3px solid #2271b1' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
              margin: '0',
              boxShadow: 'none',
              outline: 'none'
            }
          }, tab.title)
        )),

        // Right Column: Badges + Batch Revert
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
          // v1.9.2 – Batch Revert to Draft button
          isSuper && el(Tooltip, { text: __('Revert all features in Develop status back to Draft. This will delete all history and implementation data.', 'vaptguard') },
            el(Button, {
              id: 'vapt-batch-revert-btn',
              variant: 'secondary',
              isDestructive: true,
              onClick: () => previewBatchRevert(),
              style: { fontSize: '11px', height: '28px', padding: '0 10px', transition: 'all 0.2s', marginLeft: '5px' }
            }, __('↩️ Revert All to Draft', 'vaptguard'))
          ),
          // v1.9.2 – Clear Enforcement Cache button
          isSuper && el(Tooltip, { text: __('Clear the enforcement cache to refresh the X-VAPT-Feature header list. Use this after implementing or reverting features.', 'vaptguard') },
            el(Button, {
              id: 'vapt-clear-cache-btn',
              variant: 'secondary',
              onClick: () => clearEnforcementCache(),
              style: { fontSize: '11px', height: '28px', padding: '0 10px', transition: 'all 0.2s', marginLeft: '5px' }
            }, __('🔄 Clear Cache', 'vaptguard'))
          )
        ])
      ]),
      saveStatus && el('div', {
        id: 'vapt-global-status-toast',
        className: `vapt-toast-notification is-${saveStatus.type === 'error' ? 'error' : 'success'}`
      }, saveStatus.message),

      (() => {
        let currentTabObj = tabs.find(t => t.name === activeTab) || tabs[0];
        switch (currentTabObj.name) {
          case 'features': return el(FeatureList, {
            key: selectedFile, // Force remount on file change to fix persistence
            features,
            schema,
            updateFeature,
            loading,
            dataFiles,
            selectedFile,
            allFiles,
            hiddenFiles,
            onUpdateHiddenFiles: updateHiddenFiles,
            manageSourcesStatus: manageSourcesStatus,
            onSelectFile: onSelectFile,
            onUpload: uploadJSON,
            isManageModalOpen,
            setIsManageModalOpen,
            onRemoveFile: removeJSONFile,
            designPromptConfig,
            setDesignPromptConfig,
            isPromptConfigModalOpen,
            setIsPromptConfigModalOpen,
            isMappingModalOpen,
            setIsMappingModalOpen,
            historyFeature,
            setHistoryFeature,
            designFeature,
            setDesignFeature,
            transitioning,
            setTransitioning,
            sortBySource,
            setSortBySource,
            sortSourceDirection,
            setSortSourceDirection,
            environmentProfile
          });
          case 'license': return el(LicenseManager, {
            domains,
            fetchData,
            isSuper,
            loading,
            addDomain,
            deleteDomain,
            globalSetConfirmState: setConfirmState,
            deletingId
          });
          case 'domains': return el(DomainFeatures, { domains, features, isDomainModalOpen, selectedDomain, setDomainModalOpen, setSelectedDomain, updateDomainFeatures, addDomain, deleteDomain, batchDeleteDomains, setConfirmState, selectedDomains, setSelectedDomains, dataFiles, selectedFile, onSelectFile });
          case 'build': return el(BuildGenerator, { domains, features, activeFile: selectedFile, setAlertState });
          default: return null;
        }
      })(),

      // Global Modals
      historyFeature && el(HistoryModal, {
        feature: historyFeature,
        updateFeature: updateFeature,
        onClose: () => setHistoryFeature(null)
      }),

      transitioning && el(TransitionNoteModal, {
        transitioning: transitioning,
        onConfirm: confirmTransition,
        onCancel: () => setTransitioning(null)
      }),

      // v1.9.2 – Batch Revert Modal
      batchRevertModal && el(BatchRevertModal, {
        isOpen: !!batchRevertModal,
        previewData: batchRevertModal.previewData,
        isLoading: batchRevertModal.isLoading,
        isExecuting: batchRevertModal.isExecuting,
        includeBroken: includeBroken,
        onToggleIncludeBroken: (val) => { setIncludeBroken(val); previewBatchRevert({ includeBroken: val }); },
        includeRelease: includeRelease,
        onToggleIncludeRelease: (val) => { setIncludeRelease(val); previewBatchRevert({ includeRelease: val }); },
        onRefresh: previewBatchRevert,
        onConfirm: executeBatchRevert,
        onCancel: () => setBatchRevertModal(null)
      }),

      designFeature && el(DesignModal, {
        feature: designFeature,
        updateFeature: updateFeature,
        designPromptConfig: designPromptConfig,
        setDesignPromptConfig: setDesignPromptConfig,
        setIsPromptConfigModalOpen: setIsPromptConfigModalOpen,
        selectedFile: selectedFile,
        fieldMapping: fieldMapping, // Pass mapping config to DesignModal
        rootAiInstructions: rootAiInstructions,
        rootGlobalSettings: rootGlobalSettings,
        onClose: () => !isPromptConfigModalOpen && setDesignFeature(null)
      }),

      isPromptConfigModalOpen && el(PromptConfigModal, {
        isOpen: isPromptConfigModalOpen,
        onClose: () => setIsPromptConfigModalOpen(false),
        feature: designFeature
      }),

      isMappingModalOpen && el(FieldMappingModal, {
        isOpen: isMappingModalOpen,
        onClose: () => setIsMappingModalOpen(false),
        fieldMapping: fieldMapping,
        setFieldMapping: setFieldMapping,
        allKeys: allKeys
      }),

      alertState && el(vaptguard_AlertModal, {
        isOpen: true,
        message: alertState.message,
        type: alertState.type,
        onClose: () => setAlertState(null)
      }),
      confirmState && el(vaptguard_ConfirmModal, {
        isOpen: !!confirmState,
        message: confirmState.message,
        isDestructive: confirmState.isDestructive,
        onConfirm: confirmState.onConfirm,
        onCancel: () => setConfirmState(null)
      })
    ]);
  };

  const init = () => {
    const container = document.getElementById('vapt-admin-root');
    if (!container) {
      vaptLog.debug('Root container #vapt-admin-root not found.');
      return;
    }

    vaptLog.log('Starting React mount...');

    if (typeof wp === 'undefined' || !wp.element) {
      vaptLog.error('WordPress React environment (wp.element) missing!');
      container.innerHTML = '<div class="notice notice-error"><p>Error: WordPress React components failed to load. Please check plugin dependencies.</p></div>';
      return;
    }

    try {
      const root = wp.element.createRoot ? wp.element.createRoot(container) : null;
      if (root) {
        root.render(el(ErrorBoundary, null, el(VAPTAdmin)));
      } else {
        wp.element.render(el(ErrorBoundary, null, el(VAPTAdmin)), container);
      }
      vaptLog.log('React app mounted successfully.');

      // Remove the loading notice if present
      const loadingNotice = container.querySelector('.notice-info');
      if (loadingNotice) loadingNotice.remove();

    } catch (err) {
      vaptLog.error('Mounting exception:', err);
      container.innerHTML = `<div class="notice notice-error"><p>Critical UI Mounting Error: ${err.message}</p></div>`;
    }
  };

  // Expose init globally for diagnostics
  window.vaptInit = init;

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    vaptLog.log('Document ready, running init');
    init();
  } else {
    vaptLog.log('Waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', init);
  }
})();
