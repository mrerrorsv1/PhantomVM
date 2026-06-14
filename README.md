FPVM — Phantom Virtual Machine
​The Philosophy
​I built FPVM as an experiment to explore operating system design directly within the browser environment. Facing the limitations of running heavy, off-the-shelf Virtual Machines, I decided to architect my own lightweight VM from the ground up. The goal was to understand the core mechanics of system sovereignty, privilege levels, and hardware-software interaction without relying on abstraction layers.
​Architecture
​FPVM mimics modern processor designs by implementing a dual-mode execution environment:
​Kernel Mode: Runs with absolute authority. All memory addresses are absolute, giving the kernel full control over the system state.
​User Mode: A restricted environment constrained to 3KB of memory. Addresses here are relative, mediated by the V_BASE register. This ensures that user-space programs cannot interfere with kernel operations or other processes.
​Key Features
​Privilege Separation: 64 registers are exclusively reserved for the Kernel to ensure system security and stability.
​Flexibility & Security: The VM allows the Kernel to define stack boundaries per program. By configuring specific stack registers (address, size, counter) before execution, the Kernel maintains full control over memory safety and allocation.
​Time-Slicing (Interrupts): To ensure the Kernel remains the ultimate authority, I implemented a custom clock interrupt mechanism. This is the only way to preempt user programs and return control to the Kernel.
​Dispatch Table Engine: I optimized the execution loop by moving from a standard switch-case statement to a Dispatch Table. This allows the V8 engine to optimize individual handlers, significantly improving performance.
​Exception Handling: A robust interrupt system handles all errors, system calls, and signals, redirecting the execution flow to the Kernel's defined entry points.
​Register Mapping
​The architecture uses a large register file (1KB reserved), allowing for complex state management and dedicated registers for the PC (Program Counter), stack pointers for function calls, and value-tracking registers. The Kernel controls the V_DIRECTING_PROVINCE register, which acts as the gateway for all interrupts and error handling.
