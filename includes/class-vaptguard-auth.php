<?php

/**
 * Superadmin OTP Authentication for VAPTGuard Pro
 */

if (! defined('ABSPATH')) {
    exit;
}

class VAPTGUARD_Auth
{
    private const OTP_TTL = 900;
    private const AUTH_TTL = 43200;

    public function __construct()
    {
        add_action('admin_post_vaptguard_verify_otp', array(__CLASS__, 'handle_otp_verification'));
        add_action('admin_post_vaptguard_resend_otp', array(__CLASS__, 'handle_otp_resend'));
    }

    public static function is_authenticated()
    {
        $identity = vaptguard_get_superadmin_identity();
        $auth_key = self::auth_transient_key($identity['user']);
        return (bool) get_transient($auth_key);
    }

    public static function send_otp()
    {
        $identity = vaptguard_get_superadmin_identity();
        if (empty($identity['email'])) {
            return false;
        }

        $otp = wp_rand(100000, 999999);
        $otp_hash = wp_hash_password((string) $otp);

        set_transient(self::otp_transient_key($identity['user']), $otp_hash, self::OTP_TTL);
        set_transient(self::otp_sent_transient_key($identity['user']), true, self::OTP_TTL);

        $subject = sprintf('[VAPTGuard] OTP Verification for %s', get_bloginfo('name'));
        $message = implode(
            "\n",
            array(
                'Your VAPTGuard OTP is:',
                '',
                (string) $otp,
                '',
                'This code expires in 15 minutes.',
            )
        );

        $headers = array('Content-Type: text/plain; charset=UTF-8');
        return wp_mail($identity['email'], $subject, $message, $headers);
    }

    public static function render_otp_form($redirect_to = '')
    {
        $identity = vaptguard_get_superadmin_identity();
        $sent = (bool) get_transient(self::otp_sent_transient_key($identity['user']));
        $message = isset($_GET['vaptguard_otp']) ? sanitize_text_field(wp_unslash($_GET['vaptguard_otp'])) : '';
        $raw_redirect = $redirect_to;
        if (! is_string($raw_redirect) || $raw_redirect === '') {
            $raw_redirect = isset($_GET['redirect_to']) ? wp_unslash($_GET['redirect_to']) : '';
        }
        $redirect_to = self::resolve_redirect_target($raw_redirect);
        ?>
        <div class="wrap">
            <h1><?php echo esc_html__('VAPTGuard OTP Verification', 'vaptguard'); ?></h1>
            <?php if ($message === 'success') : ?>
                <div class="notice notice-success"><p><?php echo esc_html__('OTP verified. Reload the page to continue.', 'vaptguard'); ?></p></div>
            <?php elseif ($message === 'failed') : ?>
                <div class="notice notice-error"><p><?php echo esc_html__('Invalid or expired OTP. Request a new code.', 'vaptguard'); ?></p></div>
            <?php endif; ?>
            <p><?php echo esc_html(sprintf('Verification is required for %s (%s).', $identity['user'], $identity['email'])); ?></p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="max-width:420px;">
                <?php wp_nonce_field('vaptguard_verify_otp'); ?>
                <input type="hidden" name="action" value="vaptguard_verify_otp" />
                <input type="hidden" name="redirect_to" value="<?php echo esc_attr($redirect_to); ?>" />
                <p>
                    <label for="vaptguard_otp_code"><?php echo esc_html__('Enter OTP', 'vaptguard'); ?></label><br />
                    <input type="text" id="vaptguard_otp_code" name="otp_code" inputmode="numeric" autocomplete="one-time-code" required style="width:100%;padding:8px;" />
                </p>
                <p>
                    <button type="submit" class="button button-primary"><?php echo esc_html__('Verify OTP', 'vaptguard'); ?></button>
                </p>
            </form>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="max-width:420px; margin-top: 12px;">
                <?php wp_nonce_field('vaptguard_resend_otp'); ?>
                <input type="hidden" name="action" value="vaptguard_resend_otp" />
                <input type="hidden" name="redirect_to" value="<?php echo esc_attr($redirect_to); ?>" />
                <p>
                    <button type="submit" class="button"><?php echo esc_html($sent ? __('Resend OTP', 'vaptguard') : __('Send OTP', 'vaptguard')); ?></button>
                </p>
            </form>
        </div>
        <?php
    }

    public static function handle_otp_verification()
    {
        if (! current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have permission to verify OTP.', 'vaptguard'));
        }

        check_admin_referer('vaptguard_verify_otp');

        $identity = vaptguard_get_superadmin_identity();
        $redirect_to = self::resolve_redirect_target(isset($_POST['redirect_to']) ? wp_unslash($_POST['redirect_to']) : '');
        if (! self::current_user_matches_identity($identity)) {
            wp_safe_redirect(add_query_arg(
                array(
                    'vaptguard_otp' => 'failed',
                    'redirect_to' => $redirect_to,
                ),
                $redirect_to
            ));
            exit;
        }

        $otp = isset($_POST['otp_code']) ? sanitize_text_field(wp_unslash($_POST['otp_code'])) : '';
        $otp_hash = get_transient(self::otp_transient_key($identity['user']));

        if (empty($otp) || empty($otp_hash) || ! wp_check_password($otp, $otp_hash)) {
            wp_safe_redirect(add_query_arg(
                array(
                    'vaptguard_otp' => 'failed',
                    'redirect_to' => $redirect_to,
                ),
                $redirect_to
            ));
            exit;
        }

        delete_transient(self::otp_transient_key($identity['user']));
        set_transient(self::auth_transient_key($identity['user']), true, self::AUTH_TTL);
        wp_safe_redirect($redirect_to);
        exit;
    }

    public static function handle_otp_resend()
    {
        if (! current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have permission to request OTP.', 'vaptguard'));
        }

        check_admin_referer('vaptguard_resend_otp');

        $identity = vaptguard_get_superadmin_identity();
        $redirect_to = self::resolve_redirect_target(isset($_POST['redirect_to']) ? wp_unslash($_POST['redirect_to']) : '');
        if (! self::current_user_matches_identity($identity)) {
            wp_safe_redirect(add_query_arg(
                array(
                    'vaptguard_otp' => 'failed',
                    'redirect_to' => $redirect_to,
                ),
                $redirect_to
            ));
            exit;
        }

        self::send_otp();
        wp_safe_redirect(add_query_arg(
            array(
                'vaptguard_otp' => 'resent',
                'redirect_to' => $redirect_to,
            ),
            $redirect_to
        ));
        exit;
    }

    private static function current_user_matches_identity($identity)
    {
        $current_user = wp_get_current_user();
        if (! $current_user || ! $current_user->exists()) {
            return false;
        }

        return strtolower($current_user->user_login) === strtolower($identity['user']);
    }

    private static function auth_transient_key($user)
    {
        return 'vaptguard_otp_auth_' . sanitize_key((string) $user);
    }

    private static function otp_transient_key($user)
    {
        return 'vaptguard_otp_code_' . sanitize_key((string) $user);
    }

    private static function otp_sent_transient_key($user)
    {
        return 'vaptguard_otp_email_' . sanitize_key((string) $user);
    }

    private static function resolve_redirect_target($raw_redirect)
    {
        $default = admin_url('admin.php?page=vaptguard-domain-admin');
        if (! is_string($raw_redirect) || $raw_redirect === '') {
            return $default;
        }

        return wp_validate_redirect($raw_redirect, $default);
    }
}
