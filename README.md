
# classifyText

A rather simplistic (but entertaining) experiment in text 
classification. Specify one or more directories corresponding to 
classes of text. The program uses one-versus-all logistic regression 
to perform classification predictions for each file in the target 
directory. 

Classification accuracy in general tends to be very poor but can be 
improved by adding custom tailored feature extraction functions to the
class App in classifyText. For example, the ability of the program
to classify files by programming language can be improved by adding
feature extractors which gather features that are peculiar to specific 
languages.

## Installation

```shell
npm install
```

## Usage

```shell
classifyText --source-dir=[ARG+] --target-dir=[ARG+]
```
