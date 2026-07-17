#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

char *facematch_init_sessions(const char *detector_path_ptr, const char *recognition_path_ptr);

char *facematch_init_sessions(const char *detector_path_ptr, const char *recognition_path_ptr);

char *facematch_cleanup_sessions(void);

char *facematch_cleanup_sessions(void);

char *analyze_face_detection(const uint8_t *image_bytes_ptr,
                             uintptr_t len,
                             const char *scrfd_path_ptr);

char *analyze_face_detection(const uint8_t *image_bytes_ptr,
                             uintptr_t len,
                             const char *scrfd_path_ptr);

char *analyze_face_embedding(const uint8_t *image_bytes_ptr,
                             uintptr_t len,
                             const char *arcface_path_ptr,
                             const char *landmarks_json_ptr);

char *analyze_face_embedding(const uint8_t *image_bytes_ptr,
                             uintptr_t len,
                             const char *arcface_path_ptr,
                             const char *landmarks_json_ptr);

void rust_string_free(char *s);
