module escrow_addr::escrow_system {
    use std::signer;
    use std::vector;
    use std::string::{Self, String};
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;
    use aptos_std::table::{Self, Table};
    use aptos_std::event;

    /// Error codes
    const E_CONTRACT_NOT_FOUND: u64 = 1;
    const E_UNAUTHORIZED: u64 = 2;
    const E_CONTRACT_ALREADY_ACCEPTED: u64 = 3;
    const E_INVALID_MILESTONE: u64 = 4;
    const E_INSUFFICIENT_FUNDS: u64 = 5;
    const E_MILESTONE_ALREADY_PAID: u64 = 6;
    const E_CONTRACT_NOT_ACCEPTED: u64 = 7;
    const E_MILESTONE_NOT_COMPLETED: u64 = 8;
    const E_INVALID_STATUS: u64 = 9;
    const E_ESCROW_NOT_INITIALIZED: u64 = 10;
    const E_INVALID_INPUT: u64 = 11;
    const E_MILESTONE_COUNT_MISMATCH: u64 = 12;
    const E_EMPTY_MILESTONES: u64 = 13;
    const E_ZERO_AMOUNT: u64 = 14;

    /// Contract status
    const STATUS_PENDING: u8 = 0;
    const STATUS_ACCEPTED: u8 = 1;
    const STATUS_COMPLETED: u8 = 2;
    const STATUS_CANCELLED: u8 = 3;

    /// Milestone status
    const MILESTONE_PENDING: u8 = 0;
    const MILESTONE_COMPLETED: u8 = 1;
    const MILESTONE_PAID: u8 = 2;

    struct Milestone has store, copy, drop {
        description: String,
        amount: u64,
        status: u8,
        completed_at: u64,
        paid_at: u64,
    }

    struct Contract has store, copy, drop {
        id: u64,
        client: address,
        freelancer: address,
        title: String,
        description: String,
        skills: String,
        total_payment: u64,
        milestones: vector<Milestone>,
        status: u8,
        created_at: u64,
        accepted_at: u64,
        completed_at: u64,
    }

    struct EscrowSystem has key {
        contracts: Table<u64, Contract>,
        contract_counter: u64,
        client_contracts: Table<address, vector<u64>>,
        available_contracts: vector<u64>,
        freelancer_contracts: Table<address, vector<u64>>,
        escrow_balance: u64,
        total_contracts_created: u64,
        total_payments_released: u64,
        total_volume_processed: u64,
    }

    /// Events
    struct ContractCreatedEvent has drop, store {
        contract_id: u64,
        client: address,
        freelancer: address,
        title: String,
        total_payment: u64,
        milestone_count: u64,
        timestamp: u64,
    }

    struct ContractAcceptedEvent has drop, store {
        contract_id: u64,
        freelancer: address,
        client: address,
        title: String,
        timestamp: u64,
    }

    struct PaymentReleasedEvent has drop, store {
        contract_id: u64,
        milestone_index: u64,
        amount: u64,
        client: address,
        freelancer: address,
        timestamp: u64,
    }

    struct ContractCancelledEvent has drop, store {
        contract_id: u64,
        client: address,
        refund_amount: u64,
        reason: String,
        timestamp: u64,
    }

    struct MilestoneCompletedEvent has drop, store {
        contract_id: u64,
        milestone_index: u64,
        freelancer: address,
        description: String,
        timestamp: u64,
    }

    struct ContractCompletedEvent has drop, store {
        contract_id: u64,
        client: address,
        freelancer: address,
        total_amount: u64,
        milestone_count: u64,
        duration_days: u64,
        timestamp: u64,
    }

    /// Event handles
    struct EventHandles has key {
        contract_created_events: event::EventHandle<ContractCreatedEvent>,
        contract_accepted_events: event::EventHandle<ContractAcceptedEvent>,
        payment_released_events: event::EventHandle<PaymentReleasedEvent>,
        contract_cancelled_events: event::EventHandle<ContractCancelledEvent>,
        milestone_completed_events: event::EventHandle<MilestoneCompletedEvent>,
        contract_completed_events: event::EventHandle<ContractCompletedEvent>,
    }

    /// Initialize the escrow system
    public entry fun initialize(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        
        if (!exists<EscrowSystem>(admin_addr)) {
            move_to(admin, EscrowSystem {
                contracts: table::new(),
                contract_counter: 0,
                client_contracts: table::new(),
                available_contracts: vector::empty(),
                freelancer_contracts: table::new(),
                escrow_balance: 0,
                total_contracts_created: 0,
                total_payments_released: 0,
                total_volume_processed: 0,
            });
        };

        if (!exists<EventHandles>(admin_addr)) {
            move_to(admin, EventHandles {
                contract_created_events: event::new_event_handle<ContractCreatedEvent>(admin),
                contract_accepted_events: event::new_event_handle<ContractAcceptedEvent>(admin),
                payment_released_events: event::new_event_handle<PaymentReleasedEvent>(admin),
                contract_cancelled_events: event::new_event_handle<ContractCancelledEvent>(admin),
                milestone_completed_events: event::new_event_handle<MilestoneCompletedEvent>(admin),
                contract_completed_events: event::new_event_handle<ContractCompletedEvent>(admin),
            });
        };
    }

    /// Create a new escrow contract
    public entry fun create_contract(
        client: &signer,
        title: String,
        description: String,
        skills: String,
        milestone_descriptions: vector<String>,
        milestone_amounts: vector<u64>,
        escrow_addr: address,
    ) acquires EscrowSystem, EventHandles {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let client_addr = signer::address_of(client);
        let escrow_system = borrow_global_mut<EscrowSystem>(escrow_addr);
        
        // Validate input
        let milestone_count = vector::length(&milestone_amounts);
        assert!(milestone_count > 0, E_EMPTY_MILESTONES);
        assert!(vector::length(&milestone_descriptions) == milestone_count, E_MILESTONE_COUNT_MISMATCH);
        
        // Calculate total payment and validate amounts
        let total_payment = 0u64;
        let i = 0;
        
        // Create milestones vector
        let milestones = vector::empty<Milestone>();
        while (i < milestone_count) {
            let amount = *vector::borrow(&milestone_amounts, i);
            assert!(amount > 0, E_ZERO_AMOUNT);
            total_payment = total_payment + amount;
            
            vector::push_back(&mut milestones, Milestone {
                description: *vector::borrow(&milestone_descriptions, i),
                amount,
                status: MILESTONE_PENDING,
                completed_at: 0,
                paid_at: 0,
            });
            i = i + 1;
        };

        // Ensure client has sufficient balance
        let client_balance = coin::balance<AptosCoin>(client_addr);
        assert!(client_balance >= total_payment, E_INSUFFICIENT_FUNDS);

        // Transfer funds to escrow
        coin::transfer<AptosCoin>(client, escrow_addr, total_payment);

        // Create contract
        let contract_id = escrow_system.contract_counter;
        let current_time = timestamp::now_seconds();
        let contract = Contract {
            id: contract_id,
            client: client_addr,
            freelancer: @0x0, // Will be set when accepted
            title,
            description,
            skills,
            total_payment,
            milestones,
            status: STATUS_PENDING,
            created_at: current_time,
            accepted_at: 0,
            completed_at: 0,
        };

        // Store contract
        table::add(&mut escrow_system.contracts, contract_id, contract);
        vector::push_back(&mut escrow_system.available_contracts, contract_id);
        
        // Add to client's contracts
        if (!table::contains(&escrow_system.client_contracts, client_addr)) {
            table::add(&mut escrow_system.client_contracts, client_addr, vector::empty());
        };
        let client_contract_list = table::borrow_mut(&mut escrow_system.client_contracts, client_addr);
        vector::push_back(client_contract_list, contract_id);

        // Update system statistics
        escrow_system.escrow_balance = escrow_system.escrow_balance + total_payment;
        escrow_system.contract_counter = contract_id + 1;
        escrow_system.total_contracts_created = escrow_system.total_contracts_created + 1;

        // Emit event
        let event_handles = borrow_global_mut<EventHandles>(escrow_addr);
        event::emit_event(&mut event_handles.contract_created_events, ContractCreatedEvent {
            contract_id,
            client: client_addr,
            freelancer: @0x0,
            title,
            total_payment,
            milestone_count,
            timestamp: current_time,
        });
    }

    /// Accept a contract (freelancer)
    public entry fun accept_contract(
        freelancer: &signer,
        contract_id: u64,
        escrow_addr: address,
    ) acquires EscrowSystem, EventHandles {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let freelancer_addr = signer::address_of(freelancer);
        let escrow_system = borrow_global_mut<EscrowSystem>(escrow_addr);
        
        assert!(table::contains(&escrow_system.contracts, contract_id), E_CONTRACT_NOT_FOUND);
        
        let contract = table::borrow_mut(&mut escrow_system.contracts, contract_id);
        assert!(contract.status == STATUS_PENDING, E_CONTRACT_ALREADY_ACCEPTED);
        assert!(contract.client != freelancer_addr, E_UNAUTHORIZED); // Client cannot accept their own contract
        
        let current_time = timestamp::now_seconds();
        
        // Update contract
        contract.freelancer = freelancer_addr;
        contract.status = STATUS_ACCEPTED;
        contract.accepted_at = current_time;

        // Remove from available contracts
        let (found, index) = vector::index_of(&escrow_system.available_contracts, &contract_id);
        if (found) {
            vector::remove(&mut escrow_system.available_contracts, index);
        };

        // Add to freelancer's contracts
        if (!table::contains(&escrow_system.freelancer_contracts, freelancer_addr)) {
            table::add(&mut escrow_system.freelancer_contracts, freelancer_addr, vector::empty());
        };
        let freelancer_contract_list = table::borrow_mut(&mut escrow_system.freelancer_contracts, freelancer_addr);
        vector::push_back(freelancer_contract_list, contract_id);

        // Emit event
        let event_handles = borrow_global_mut<EventHandles>(escrow_addr);
        event::emit_event(&mut event_handles.contract_accepted_events, ContractAcceptedEvent {
            contract_id,
            freelancer: freelancer_addr,
            client: contract.client,
            title: contract.title,
            timestamp: current_time,
        });
    }

    /// Skip a contract (freelancer decides not to view this contract anymore)
    public entry fun skip_contract(
        freelancer: &signer,
        contract_id: u64,
        escrow_addr: address,
    ) acquires EscrowSystem {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let _freelancer_addr = signer::address_of(freelancer);
        let escrow_system = borrow_global<EscrowSystem>(escrow_addr);
        
        // Verify contract exists and is available
        assert!(table::contains(&escrow_system.contracts, contract_id), E_CONTRACT_NOT_FOUND);
        let contract = table::borrow(&escrow_system.contracts, contract_id);
        assert!(contract.status == STATUS_PENDING, E_INVALID_STATUS);
        
        // In a full implementation, you might want to track which freelancers
        // have skipped which contracts to avoid showing them repeatedly
        // For now, this is a placeholder that validates the contract exists
    }

    /// Mark milestone as completed (freelancer)
    public entry fun complete_milestone(
        freelancer: &signer,
        contract_id: u64,
        milestone_index: u64,
        escrow_addr: address,
    ) acquires EscrowSystem, EventHandles {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let freelancer_addr = signer::address_of(freelancer);
        let escrow_system = borrow_global_mut<EscrowSystem>(escrow_addr);
        
        assert!(table::contains(&escrow_system.contracts, contract_id), E_CONTRACT_NOT_FOUND);
        
        let contract = table::borrow_mut(&mut escrow_system.contracts, contract_id);
        assert!(contract.freelancer == freelancer_addr, E_UNAUTHORIZED);
        assert!(contract.status == STATUS_ACCEPTED, E_CONTRACT_NOT_ACCEPTED);
        
        let milestone_count = vector::length(&contract.milestones);
        assert!(milestone_index < milestone_count, E_INVALID_MILESTONE);
        
        let milestone = vector::borrow_mut(&mut contract.milestones, milestone_index);
        assert!(milestone.status == MILESTONE_PENDING, E_MILESTONE_ALREADY_PAID);
        
        let current_time = timestamp::now_seconds();
        
        // Update milestone status
        milestone.status = MILESTONE_COMPLETED;
        milestone.completed_at = current_time;

        // Emit event
        let event_handles = borrow_global_mut<EventHandles>(escrow_addr);
        event::emit_event(&mut event_handles.milestone_completed_events, MilestoneCompletedEvent {
            contract_id,
            milestone_index,
            freelancer: freelancer_addr,
            description: milestone.description,
            timestamp: current_time,
        });
    }

    /// Release payment for a milestone (client only)
    public entry fun release_payment(
        client: &signer,
        contract_id: u64,
        milestone_index: u64,
        escrow_addr: address,
    ) acquires EscrowSystem, EventHandles {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let client_addr = signer::address_of(client);
        let escrow_system = borrow_global_mut<EscrowSystem>(escrow_addr);
        
        assert!(table::contains(&escrow_system.contracts, contract_id), E_CONTRACT_NOT_FOUND);
        
        let contract = table::borrow_mut(&mut escrow_system.contracts, contract_id);
        assert!(contract.client == client_addr, E_UNAUTHORIZED);
        assert!(contract.status == STATUS_ACCEPTED, E_CONTRACT_NOT_ACCEPTED);
        
        let milestone_count = vector::length(&contract.milestones);
        assert!(milestone_index < milestone_count, E_INVALID_MILESTONE);
        
        let milestone = vector::borrow_mut(&mut contract.milestones, milestone_index);
        assert!(milestone.status == MILESTONE_COMPLETED, E_MILESTONE_NOT_COMPLETED);
        
        let current_time = timestamp::now_seconds();
        
        // Transfer payment to freelancer
        coin::transfer<AptosCoin>(client, contract.freelancer, milestone.amount);
        
        // Update milestone status
        milestone.status = MILESTONE_PAID;
        milestone.paid_at = current_time;
        
        // Update escrow balance and statistics
        escrow_system.escrow_balance = escrow_system.escrow_balance - milestone.amount;
        escrow_system.total_payments_released = escrow_system.total_payments_released + 1;
        escrow_system.total_volume_processed = escrow_system.total_volume_processed + milestone.amount;

        // Check if all milestones are paid
        let all_paid = true;
        let i = 0;
        while (i < milestone_count) {
            let m = vector::borrow(&contract.milestones, i);
            if (m.status != MILESTONE_PAID) {
                all_paid = false;
                break
            };
            i = i + 1;
        };

        if (all_paid) {
            contract.status = STATUS_COMPLETED;
            contract.completed_at = current_time;
            
            // Emit contract completed event
            let duration_days = (current_time - contract.accepted_at) / 86400; // Convert seconds to days
            let event_handles = borrow_global_mut<EventHandles>(escrow_addr);
            event::emit_event(&mut event_handles.contract_completed_events, ContractCompletedEvent {
                contract_id,
                client: contract.client,
                freelancer: contract.freelancer,
                total_amount: contract.total_payment,
                milestone_count,
                duration_days,
                timestamp: current_time,
            });
        };

        // Emit payment released event
        let event_handles = borrow_global_mut<EventHandles>(escrow_addr);
        event::emit_event(&mut event_handles.payment_released_events, PaymentReleasedEvent {
            contract_id,
            milestone_index,
            amount: milestone.amount,
            client: client_addr,
            freelancer: contract.freelancer,
            timestamp: current_time,
        });
    }

    /// Cancel contract and refund client (only for pending contracts)
    public entry fun cancel_contract(
        client: &signer,
        contract_id: u64,
        reason: String,
        escrow_addr: address,
    ) acquires EscrowSystem, EventHandles {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let client_addr = signer::address_of(client);
        let escrow_system = borrow_global_mut<EscrowSystem>(escrow_addr);
        
        assert!(table::contains(&escrow_system.contracts, contract_id), E_CONTRACT_NOT_FOUND);
        
        let contract = table::borrow_mut(&mut escrow_system.contracts, contract_id);
        assert!(contract.client == client_addr, E_UNAUTHORIZED);
        assert!(contract.status == STATUS_PENDING, E_INVALID_STATUS);
        
        let current_time = timestamp::now_seconds();
        
        // Update contract status
        contract.status = STATUS_CANCELLED;
        
        // Remove from available contracts
        let (found, index) = vector::index_of(&escrow_system.available_contracts, &contract_id);
        if (found) {
            vector::remove(&mut escrow_system.available_contracts, index);
        };
        
        // Refund client
        coin::transfer<AptosCoin>(client, client_addr, contract.total_payment);
        
        // Update escrow balance
        escrow_system.escrow_balance = escrow_system.escrow_balance - contract.total_payment;

        // Emit event
        let event_handles = borrow_global_mut<EventHandles>(escrow_addr);
        event::emit_event(&mut event_handles.contract_cancelled_events, ContractCancelledEvent {
            contract_id,
            client: client_addr,
            refund_amount: contract.total_payment,
            reason,
            timestamp: current_time,
        });
    }

    /// Dispute resolution - allows admin to resolve disputes
    public entry fun resolve_dispute(
        admin: &signer,
        contract_id: u64,
        refund_percentage: u64, // 0-100, percentage to refund to client
        escrow_addr: address,
    ) acquires EscrowSystem, EventHandles {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == escrow_addr, E_UNAUTHORIZED); // Only admin can resolve disputes
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        assert!(refund_percentage <= 100, E_INVALID_INPUT);
        
        let escrow_system = borrow_global_mut<EscrowSystem>(escrow_addr);
        assert!(table::contains(&escrow_system.contracts, contract_id), E_CONTRACT_NOT_FOUND);
        
        let contract = table::borrow_mut(&mut escrow_system.contracts, contract_id);
        assert!(contract.status == STATUS_ACCEPTED, E_INVALID_STATUS);
        
        let current_time = timestamp::now_seconds();
        
        // Calculate amounts
        let total_locked = contract.total_payment;
        let refund_amount = (total_locked * refund_percentage) / 100;
        let freelancer_amount = total_locked - refund_amount;
        
        // Transfer amounts
        if (refund_amount > 0) {
            coin::transfer<AptosCoin>(admin, contract.client, refund_amount);
        };
        if (freelancer_amount > 0) {
            coin::transfer<AptosCoin>(admin, contract.freelancer, freelancer_amount);
        };
        
        // Update contract status
        contract.status = STATUS_COMPLETED;
        contract.completed_at = current_time;
        
        // Update all milestones as paid
        let milestone_count = vector::length(&contract.milestones);
        let i = 0;
        while (i < milestone_count) {
            let milestone = vector::borrow_mut(&mut contract.milestones, i);
            milestone.status = MILESTONE_PAID;
            milestone.paid_at = current_time;
            i = i + 1;
        };
        
        // Update escrow balance
        escrow_system.escrow_balance = escrow_system.escrow_balance - total_locked;
        escrow_system.total_volume_processed = escrow_system.total_volume_processed + total_locked;
    }

    /// Get contracts for a specific user
    #[view]
    public fun get_contracts(user_addr: address, user_type: String, escrow_addr: address): vector<Contract> acquires EscrowSystem {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let escrow_system = borrow_global<EscrowSystem>(escrow_addr);
        let contracts = vector::empty<Contract>();
        
        if (string::utf8(b"client") == user_type) {
            if (table::contains(&escrow_system.client_contracts, user_addr)) {
                let contract_ids = table::borrow(&escrow_system.client_contracts, user_addr);
                let i = 0;
                let len = vector::length(contract_ids);
                while (i < len) {
                    let contract_id = *vector::borrow(contract_ids, i);
                    if (table::contains(&escrow_system.contracts, contract_id)) {
                        let contract = *table::borrow(&escrow_system.contracts, contract_id);
                        vector::push_back(&mut contracts, contract);
                    };
                    i = i + 1;
                };
            };
        } else if (string::utf8(b"freelancer") == user_type) {
            // For freelancers, return available contracts + their accepted contracts
            let i = 0;
            let available_len = vector::length(&escrow_system.available_contracts);
            while (i < available_len) {
                let contract_id = *vector::borrow(&escrow_system.available_contracts, i);
                if (table::contains(&escrow_system.contracts, contract_id)) {
                    let contract = *table::borrow(&escrow_system.contracts, contract_id);
                    vector::push_back(&mut contracts, contract);
                };
                i = i + 1;
            };
            
            // Add accepted contracts
            if (table::contains(&escrow_system.freelancer_contracts, user_addr)) {
                let contract_ids = table::borrow(&escrow_system.freelancer_contracts, user_addr);
                let j = 0;
                let len = vector::length(contract_ids);
                while (j < len) {
                    let contract_id = *vector::borrow(contract_ids, j);
                    if (table::contains(&escrow_system.contracts, contract_id)) {
                        let contract = *table::borrow(&escrow_system.contracts, contract_id);
                        vector::push_back(&mut contracts, contract);
                    };
                    j = j + 1;
                };
            };
        };
        
        contracts
    }

    /// Get a specific contract by ID
    #[view]
    public fun get_contract_by_id(contract_id: u64, escrow_addr: address): Contract acquires EscrowSystem {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let escrow_system = borrow_global<EscrowSystem>(escrow_addr);
        assert!(table::contains(&escrow_system.contracts, contract_id), E_CONTRACT_NOT_FOUND);
        *table::borrow(&escrow_system.contracts, contract_id)
    }

    /// Get all available contracts (for freelancers)
    #[view]
    public fun get_available_contracts(escrow_addr: address): vector<Contract> acquires EscrowSystem {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let escrow_system = borrow_global<EscrowSystem>(escrow_addr);
        let contracts = vector::empty<Contract>();
        
        let i = 0;
        let len = vector::length(&escrow_system.available_contracts);
        while (i < len) {
            let contract_id = *vector::borrow(&escrow_system.available_contracts, i);
            if (table::contains(&escrow_system.contracts, contract_id)) {
                let contract = *table::borrow(&escrow_system.contracts, contract_id);
                vector::push_back(&mut contracts, contract);
            };
            i = i + 1;
        };
        
        contracts
    }

    /// Get comprehensive escrow system statistics
    #[view]
    public fun get_escrow_stats(escrow_addr: address): (u64, u64, u64, u64, u64, u64) acquires EscrowSystem {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let escrow_system = borrow_global<EscrowSystem>(escrow_addr);
        (
            escrow_system.total_contracts_created, // Total contracts created
            vector::length(&escrow_system.available_contracts), // Available contracts
            escrow_system.escrow_balance, // Total locked funds
            escrow_system.total_payments_released, // Total payments released
            escrow_system.total_volume_processed, // Total volume processed
            escrow_system.contract_counter // Next contract ID
        )
    }

    /// Get milestone details for a contract
    #[view]
    public fun get_contract_milestones(contract_id: u64, escrow_addr: address): vector<Milestone> acquires EscrowSystem {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let escrow_system = borrow_global<EscrowSystem>(escrow_addr);
        assert!(table::contains(&escrow_system.contracts, contract_id), E_CONTRACT_NOT_FOUND);
        
        let contract = table::borrow(&escrow_system.contracts, contract_id);
        contract.milestones
    }

    /// Get user statistics
    #[view]
    public fun get_user_stats(user_addr: address, escrow_addr: address): (u64, u64, u64, u64) acquires EscrowSystem {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let escrow_system = borrow_global<EscrowSystem>(escrow_addr);
        let mut client_contracts = 0u64;
        let mut freelancer_contracts = 0u64;
        let mut total_earned = 0u64;
        let mut total_spent = 0u64;
        
        // Count client contracts
        if (table::contains(&escrow_system.client_contracts, user_addr)) {
            let contract_ids = table::borrow(&escrow_system.client_contracts, user_addr);
            client_contracts = vector::length(contract_ids);
            
            // Calculate total spent
            let i = 0;
            while (i < client_contracts) {
                let contract_id = *vector::borrow(contract_ids, i);
                if (table::contains(&escrow_system.contracts, contract_id)) {
                    let contract = table::borrow(&escrow_system.contracts, contract_id);
                    if (contract.status == STATUS_COMPLETED) {
                        total_spent = total_spent + contract.total_payment;
                    };
                };
                i = i + 1;
            };
        };
        
        // Count freelancer contracts
        if (table::contains(&escrow_system.freelancer_contracts, user_addr)) {
            let contract_ids = table::borrow(&escrow_system.freelancer_contracts, user_addr);
            freelancer_contracts = vector::length(contract_ids);
            
            // Calculate total earned
            let i = 0;
            while (i < freelancer_contracts) {
                let contract_id = *vector::borrow(contract_ids, i);
                if (table::contains(&escrow_system.contracts, contract_id)) {
                    let contract = table::borrow(&escrow_system.contracts, contract_id);
                    let j = 0;
                    let milestone_count = vector::length(&contract.milestones);
                    while (j < milestone_count) {
                        let milestone = vector::borrow(&contract.milestones, j);
                        if (milestone.status == MILESTONE_PAID) {
                            total_earned = total_earned + milestone.amount;
                        };
                        j = j + 1;
                    };
                };
                i = i + 1;
            };
        };
        
        (client_contracts, freelancer_contracts, total_earned, total_spent)
    }

    /// Check if escrow system is initialized
    #[view]
    public fun is_initialized(escrow_addr: address): bool {
        exists<EscrowSystem>(escrow_addr) && exists<EventHandles>(escrow_addr)
    }

    /// Get contract status by ID
    #[view]
    public fun get_contract_status(contract_id: u64, escrow_addr: address): u8 acquires EscrowSystem {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let escrow_system = borrow_global<EscrowSystem>(escrow_addr);
        assert!(table::contains(&escrow_system.contracts, contract_id), E_CONTRACT_NOT_FOUND);
        
        let contract = table::borrow(&escrow_system.contracts, contract_id);
        contract.status
    }

    /// Get contracts by status
    #[view]
    public fun get_contracts_by_status(status: u8, escrow_addr: address): vector<Contract> acquires EscrowSystem {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let escrow_system = borrow_global<EscrowSystem>(escrow_addr);
        let contracts = vector::empty<Contract>();
        
        // Iterate through all contracts (this is expensive, consider pagination in production)
        let i = 0;
        while (i < escrow_system.contract_counter) {
            if (table::contains(&escrow_system.contracts, i)) {
                let contract = table::borrow(&escrow_system.contracts, i);
                if (contract.status == status) {
                    vector::push_back(&mut contracts, *contract);
                };
            };
            i = i + 1;
        };
        
        contracts
    }

    /// Emergency function to pause the system (admin only)
    public entry fun emergency_pause(admin: &signer, escrow_addr: address) {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == escrow_addr, E_UNAUTHORIZED);
        // In a production system, you would implement a paused state
        // and check it in all functions that modify state
    }

    /// Get platform metrics for analytics
    #[view]
    public fun get_platform_metrics(escrow_addr: address): (u64, u64, u64, u64, u64) acquires EscrowSystem {
        assert!(exists<EscrowSystem>(escrow_addr), E_ESCROW_NOT_INITIALIZED);
        
        let escrow_system = borrow_global<EscrowSystem>(escrow_addr);
        let active_contracts = vector::length(&escrow_system.available_contracts);
        
        // Calculate completion rate (simplified)
        let total_created = escrow_system.total_contracts_created;
        let completion_rate = if (total_created > 0) {
            // This is a simplified calculation
            (escrow_system.total_payments_released * 100) / total_created
        } else { 0 };
        
        (
            total_created,                              // Total contracts created
            active_contracts,                           // Currently active contracts  
            escrow_system.escrow_balance,              // Total locked funds
            escrow_system.total_volume_processed,      // Total volume processed
            completion_rate                            // Completion rate percentage
        )
    }
}