cmake_minimum_required(VERSION 3.15)
project(ASCIIArt CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Define AE SDK Location (User sets AESDK_ROOT environment variable or path)
if(NOT DEFINED AESDK_ROOT)
    set(AESDK_ROOT "C:/Adobe After Effects SDK" CACHE PATH "Path to Adobe After Effects SDK")
endif()

include_directories(
    ${AESDK_ROOT}/Headers
    ${AESDK_ROOT}/Headers/SP
    ${AESDK_ROOT}/Util
    ${CMAKE_CURRENT_SOURCE_DIR}
)

add_library(ASCIIArt SHARED
    ASCIIArt.cpp
    ASCIIArt.h
    ASCIIArt.rc
)

set_target_properties(ASCIIArt PROPERTIES
    PREFIX ""
    SUFFIX ".aex"
)

target_compile_definitions(ASCIIArt PRIVATE
    WIN32
    _WINDOWS
    PF_AE_PLUG_IN
)
