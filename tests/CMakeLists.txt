cmake_minimum_required(VERSION 3.10)

project(BakedIDETest VERSION 1.0.0 LANGUAGES CXX)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Add executable
add_executable(test_sample test_sample.cpp)

# Set output directory (optional - keeps build directory clean)
set_target_properties(test_sample PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)