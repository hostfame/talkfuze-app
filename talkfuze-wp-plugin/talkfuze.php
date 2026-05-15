<?php
/**
 * Plugin Name: TalkFuze Live Chat for WooCommerce
 * Plugin URI: https://talkfuze.com
 * Description: Embeds the TalkFuze omnichannel live chat widget onto your WooCommerce store and syncs customer context.
 * Version: 1.0.0
 * Author: TalkFuze
 * Author URI: https://talkfuze.com
 * Text Domain: talkfuze
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

class TalkFuze_Widget {

	public function __construct() {
		// Add admin menu
		add_action( 'admin_menu', array( $this, 'add_settings_page' ) );
		// Register settings
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		// Inject script to footer
		add_action( 'wp_footer', array( $this, 'inject_widget_script' ) );
	}

	public function add_settings_page() {
		add_options_page(
			'TalkFuze Settings',
			'TalkFuze',
			'manage_options',
			'talkfuze',
			array( $this, 'settings_page_html' )
		);
	}

	public function register_settings() {
		register_setting( 'talkfuze_options', 'talkfuze_org_id' );
		register_setting( 'talkfuze_options', 'talkfuze_base_url' ); // Optional override for dev
	}

	public function settings_page_html() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<form action="options.php" method="post">
				<?php
				settings_fields( 'talkfuze_options' );
				do_settings_sections( 'talkfuze_options' );
				
				$org_id = get_option( 'talkfuze_org_id' );
				$base_url = get_option( 'talkfuze_base_url', 'https://talkfuze.com' );
				?>
				<table class="form-table">
					<tr valign="top">
						<th scope="row">Organization ID</th>
						<td>
							<input type="text" name="talkfuze_org_id" value="<?php echo esc_attr( $org_id ); ?>" class="regular-text" placeholder="e.g. org_12345" />
							<p class="description">You can find this in your TalkFuze Dashboard settings.</p>
						</td>
					</tr>
					<tr valign="top">
						<th scope="row">Base URL (For Dev)</th>
						<td>
							<input type="text" name="talkfuze_base_url" value="<?php echo esc_attr( $base_url ); ?>" class="regular-text" />
							<p class="description">Keep as https://talkfuze.com unless testing locally.</p>
						</td>
					</tr>
				</table>
				<?php submit_button( 'Save Settings' ); ?>
			</form>
		</div>
		<?php
	}

	public function inject_widget_script() {
		$org_id = get_option( 'talkfuze_org_id' );
		$base_url = get_option( 'talkfuze_base_url', 'https://talkfuze.com' );

		if ( empty( $org_id ) ) {
			return; // Do not inject if org id is not set
		}

		// Prepare context data if user is logged in
		$context = array();
		if ( is_user_logged_in() ) {
			$current_user = wp_get_current_user();
			$context['user_id'] = $current_user->ID;
			$context['email'] = $current_user->user_email;
			$context['name'] = $current_user->display_name;
		}

		// Output the embed script tag
		?>
		<!-- TalkFuze Live Chat -->
		<script 
			src="<?php echo esc_url( rtrim($base_url, '/') . '/embed.js' ); ?>" 
			data-org-id="<?php echo esc_attr( $org_id ); ?>" 
			defer>
		</script>
		
		<?php if ( ! empty( $context ) ) : ?>
		<script>
			// Pass WooCommerce user context to TalkFuze
			window.addEventListener('load', function() {
				if (window.TalkFuze) {
					window.TalkFuze.setContext(<?php echo wp_json_encode( $context ); ?>);
				}
			});
		</script>
		<?php endif; ?>
		<!-- End TalkFuze Live Chat -->
		<?php
	}
}

new TalkFuze_Widget();
