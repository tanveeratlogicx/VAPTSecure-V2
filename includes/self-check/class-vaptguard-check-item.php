<?php
if (!defined('ABSPATH')) {
    exit;
}

class VAPTGUARD_Check_Item {

    public string $check_id;
    public string $status;    // 'pass' | 'warning' | 'fail'
    public string $message;
    public array  $data;      // issues list or corrections list

    public function __construct(
        string $check_id,
        string $status,
        string $message,
        array  $data = []
    ) {
        $this->check_id = $check_id;
        $this->status   = $status;
        $this->message  = $message;
        $this->data     = $data;
    }

    public function is_pass():    bool { return $this->status === 'pass';    }
    public function is_warning(): bool { return $this->status === 'warning'; }
    public function is_fail():    bool { return $this->status === 'fail';    }

    public function to_array(): array {
        return [
            'check_id' => $this->check_id,
            'status'   => $this->status,
            'message'  => $this->message,
            'data'     => $this->data,
        ];
    }
}



