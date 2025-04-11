document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    const contentPanes = document.querySelectorAll('.content-pane');
    const pauseResumeButton = document.getElementById('pause-resume-button');
    const statusIndicator = document.getElementById('status-indicator');

    let isRecording = true; // Initial state

    // Function to switch panes
    function switchPane(targetId) {
        // Update active link
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.target === targetId) {
                link.classList.add('active');
            }
        });

        // Update active pane
        contentPanes.forEach(pane => {
            pane.classList.remove('active');
            if (pane.id === targetId) {
                pane.classList.add('active');
            }
        });
    }

    // Add click listeners to navigation links
    navLinks.forEach(link => {
        // Exclude inline links used for intra-page navigation
        if (!link.classList.contains('inline-link')) {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const targetId = event.target.closest('a').dataset.target;
                if (targetId) {
                    switchPane(targetId);
                }
            });
        } else {
            // Handle inline links separately if needed, e.g. to switch tabs
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const targetId = event.target.closest('a').dataset.target;
                if (targetId) {
                    switchPane(targetId);
                    // Optionally scroll to the top of the new pane
                    document.querySelector('.main-content').scrollTop = 0;
                }
            });
        }
    });

    // Add click listener for Pause/Resume button
    if (pauseResumeButton && statusIndicator) {
        pauseResumeButton.addEventListener('click', () => {
            isRecording = !isRecording; // Toggle state
            if (isRecording) {
                statusIndicator.textContent = 'Recording Active';
                pauseResumeButton.textContent = 'Pause';
                statusIndicator.style.color = ''; // Reset color or set to active color
            } else {
                statusIndicator.textContent = 'Recording Paused';
                pauseResumeButton.textContent = 'Resume';
                statusIndicator.style.color = '#ff8c00'; // Example paused color
            }
            // In a real app, you would call functions here
            // to actually pause/resume the backend recording.
        });
    }

    // Optional: Add confirmation for danger button
    const deleteButton = document.querySelector('.danger-button');
    if (deleteButton) {
        deleteButton.addEventListener('click', () => {
            if (confirm('ARE YOU SURE you want to permanently delete all recorded data? This action cannot be undone!')) {
                // Placeholder for actual deletion logic
                alert('Data deletion simulated.');
            }
        });
    }

});