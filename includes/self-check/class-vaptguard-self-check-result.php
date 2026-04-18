<?php
if (!defined('ABSPATH')) {
    exit;
}

class VAPTGUARD_Self_Check_Result {

    private array $items       = [];
    private array $corrections = [];
    private array $applied     = [];

    public function add( VAPTGUARD_Check_Item $item ): void {
        $this->items[] = $item;

        // Collect corrections from failed checks
        if ( $item->is_fail() || $item->is_warning() ) {
            foreach ( $item->data as $entry ) {
                if ( isset($entry['type']) ) {
                    $this->corrections[] = $entry;
                }
            }
        }
    }

    public function apply_corrections(): void {
        if ( empty($this->corrections) ) { return; }
        $corrector     = new VAPTGUARD_Auto_Correct();
        $this->applied = $corrector->apply($this->corrections);
    }

    public function has_failures():         bool  { return $this->get_failed_count() > 0;    }
    public function has_critical_failures(): bool  { return $this->get_failed_count() > 0;    }

    public function get_overall_status(): string {
        foreach ( $this->items as $item ) {
            if ( $item->is_fail() ) { return 'fail'; }
        }
        foreach ( $this->items as $item ) {
            if ( $item->is_warning() ) { return 'warning'; }
        }
        return 'pass';
    }

    public function get_passed_count():  int { return count(array_filter($this->items, fn($i) => $i->is_pass()));    }
    public function get_failed_count():  int { return count(array_filter($this->items, fn($i) => $i->is_fail()));    }
    public function get_warning_count(): int { return count(array_filter($this->items, fn($i) => $i->is_warning())); }

    public function get_failures():            array { return array_filter($this->items, fn($i) => $i->is_fail());    }
    public function get_applied_corrections(): array { return $this->applied; }
    public function get_all_results():         array { return array_map(fn($i) => $i->to_array(), $this->items);     }
}



